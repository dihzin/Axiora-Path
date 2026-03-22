import { useCallback, useEffect, useRef, useState } from "react";

import type { ActionFeedbackState } from "@/components/action-feedback";
import {
  getTasks,
  getRoutineWeek,
  markRoutine,
  type RoutineTaskProgress,
  type RoutineWeekLog,
} from "@/lib/api/client";

const TASK_XP_PER_WEIGHT = 10;

type FeedbackCallback = (message: string, type?: "success" | "error") => void;

type ChildTask = {
  id: number;
  title: string;
  difficulty: string;
  weight: number;
  is_active: boolean;
};

type UseRoutineDomainInput = {
  childId: number | null;
  todayIso: string;
  onFeedback?: FeedbackCallback;
};

export type RoutineDomainState = {
  tasks: ChildTask[];
  allTasks: ChildTask[];
  routineLogs: RoutineWeekLog[];
  taskProgress: RoutineTaskProgress[];
  tasksLoadError: boolean;
  markingTaskIds: number[];
  taskFeedback: Record<number, ActionFeedbackState>;
  /** Today's log status keyed by task_id (latest per task) */
  taskStatusById: Record<number, RoutineWeekLog["status"]>;
  /** All task progress keyed by task_id */
  taskProgressById: Record<number, RoutineTaskProgress>;
  /** Number of logs for today */
  logsTodayCount: number;
  /** Approved/pending/rejected counts for today */
  todayStatusCounts: { approved: number; pending: number; rejected: number };
  /** All logs sorted newest-first */
  weeklyLogs: RoutineWeekLog[];
  /** Logs grouped by status (only non-empty groups) */
  groupedWeeklyLogs: Array<{
    title: string;
    status: RoutineWeekLog["status"];
    items: RoutineWeekLog[];
  }>;
  /** Latest activity timestamp (ms epoch), 0 if none */
  latestActivityTimestamp: number;
  onMarkTask: (taskId: number) => Promise<void>;
};

function setTransientTaskFeedback(
  taskId: number,
  state: Exclude<ActionFeedbackState, "loading">,
  setFeedback: React.Dispatch<React.SetStateAction<Record<number, ActionFeedbackState>>>,
  timersRef: React.MutableRefObject<Record<number, number>>,
) {
  setFeedback((prev) => ({ ...prev, [taskId]: state }));
  const existing = timersRef.current[taskId];
  if (existing !== undefined) window.clearTimeout(existing);
  timersRef.current[taskId] = window.setTimeout(() => {
    setFeedback((prev) => ({ ...prev, [taskId]: "idle" }));
    delete timersRef.current[taskId];
  }, 650);
}

export function useRoutineDomain({
  childId,
  todayIso,
  onFeedback,
}: UseRoutineDomainInput): RoutineDomainState {
  const [tasks, setTasks] = useState<ChildTask[]>([]);
  const [allTasks, setAllTasks] = useState<ChildTask[]>([]);
  const [routineLogs, setRoutineLogs] = useState<RoutineWeekLog[]>([]);
  const [taskProgress, setTaskProgress] = useState<RoutineTaskProgress[]>([]);
  const [tasksLoadError, setTasksLoadError] = useState(false);
  const [markingTaskIds, setMarkingTaskIds] = useState<number[]>([]);
  const [taskFeedback, setTaskFeedback] = useState<Record<number, ActionFeedbackState>>({});

  const taskFeedbackTimersRef = useRef<Record<number, number>>({});
  const onFeedbackRef = useRef(onFeedback);
  useEffect(() => { onFeedbackRef.current = onFeedback; }, [onFeedback]);

  // ── Initial load ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (childId === null) return;

    getTasks()
      .then((data) => {
        setAllTasks(data);
        setTasks(data.filter((t) => t.is_active));
        setTasksLoadError(false);
      })
      .catch(() => {
        setAllTasks([]);
        setTasks([]);
        setTasksLoadError(true);
      });

    getRoutineWeek(childId, todayIso)
      .then((data) => {
        setRoutineLogs(data.logs);
        setTaskProgress(data.task_progress);
      })
      .catch(() => {
        setRoutineLogs([]);
        setTaskProgress([]);
      });
  }, [childId, todayIso]);

  // ── Cleanup all task feedback timers on unmount ───────────────────────────
  useEffect(() => {
    return () => {
      Object.values(taskFeedbackTimersRef.current).forEach((t) => window.clearTimeout(t));
    };
  }, []);

  // ── Derived values ────────────────────────────────────────────────────────
  const taskStatusById = routineLogs
    .filter((log) => log.date === todayIso)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .reduce<Record<number, RoutineWeekLog["status"]>>((acc, log) => {
      if (!(log.task_id in acc)) acc[log.task_id] = log.status;
      return acc;
    }, {});

  const taskProgressById = taskProgress.reduce<Record<number, RoutineTaskProgress>>(
    (acc, p) => { acc[p.task_id] = p; return acc; },
    {},
  );

  const logsTodayCount = routineLogs.filter((l) => l.date === todayIso).length;

  const todayStatusCounts = Object.values(taskStatusById).reduce(
    (acc, status) => {
      if (status === "APPROVED") acc.approved += 1;
      else if (status === "PENDING") acc.pending += 1;
      else if (status === "REJECTED") acc.rejected += 1;
      return acc;
    },
    { approved: 0, pending: 0, rejected: 0 },
  );

  const weeklyLogs = [...routineLogs].sort((a, b) => {
    const byDate = b.date.localeCompare(a.date);
    return byDate !== 0 ? byDate : new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  const groupedWeeklyLogs = (
    [
      { title: "Pendentes", status: "PENDING" as const, items: weeklyLogs.filter((l) => l.status === "PENDING") },
      { title: "Aprovadas", status: "APPROVED" as const, items: weeklyLogs.filter((l) => l.status === "APPROVED") },
      { title: "Rejeitadas", status: "REJECTED" as const, items: weeklyLogs.filter((l) => l.status === "REJECTED") },
    ]
  ).filter((g) => g.items.length > 0);

  const latestActivityTimestamp = routineLogs.reduce<number>((latest, log) => {
    const parsed = Date.parse(log.created_at);
    return Number.isNaN(parsed) ? latest : Math.max(latest, parsed);
  }, 0);

  // ── Mark task (optimistic) ────────────────────────────────────────────────
  const onMarkTask = useCallback(
    async (taskId: number) => {
      if (childId === null || markingTaskIds.includes(taskId)) return;
      if (routineLogs.some((log) => log.task_id === taskId && log.date === todayIso)) return;

      const task = allTasks.find((t) => t.id === taskId);
      const optimisticId = -Date.now() - taskId;

      const optimisticLog: RoutineWeekLog = {
        id: optimisticId,
        child_id: childId,
        task_id: taskId,
        task_title: task?.title ?? `#${taskId}`,
        task_weight: task?.weight ?? 0,
        date: todayIso,
        status: "PENDING",
        created_at: new Date().toISOString(),
        decided_at: null,
        decided_by_user_id: null,
        parent_comment: null,
        xp_awarded: 0,
        xp_source: null,
      };

      setMarkingTaskIds((prev) => [...prev, taskId]);
      setTaskFeedback((prev) => ({ ...prev, [taskId]: "loading" }));
      setRoutineLogs((prev) => [optimisticLog, ...prev]);

      // Optimistic task progress update
      setTaskProgress((prev) => {
        const existing = prev.find((p) => p.task_id === taskId);
        if (!existing) {
          const w = task?.weight ?? 0;
          return [
            ...prev,
            {
              task_id: taskId,
              task_title: task?.title ?? `#${taskId}`,
              task_weight: w,
              xp_per_approval: w * TASK_XP_PER_WEIGHT,
              marked_count_week: 1,
              approved_count_week: 0,
              pending_count_week: 1,
              rejected_count_week: 0,
              completion_percent_week: 0,
              completed_today: false,
              xp_gained_week: 0,
            },
          ];
        }
        const marked = existing.marked_count_week + 1;
        const completion =
          marked > 0 ? (existing.approved_count_week / marked) * 100 : 0;
        return prev.map((p) =>
          p.task_id === taskId
            ? { ...p, marked_count_week: marked, pending_count_week: p.pending_count_week + 1, completion_percent_week: completion }
            : p,
        );
      });

      try {
        const created = await markRoutine(childId, taskId, todayIso);
        setRoutineLogs((prev) => prev.map((l) => (l.id === optimisticId ? created : l)));
        setTransientTaskFeedback(taskId, "success", setTaskFeedback, taskFeedbackTimersRef);
        onFeedbackRef.current?.("Tarefa marcada", "success");
      } catch {
        // Rollback
        setRoutineLogs((prev) => prev.filter((l) => l.id !== optimisticId));
        setTaskProgress((prev) =>
          prev
            .map((p) => {
              if (p.task_id !== taskId) return p;
              const marked = Math.max(0, p.marked_count_week - 1);
              const pending = Math.max(0, p.pending_count_week - 1);
              const completion = marked > 0 ? (p.approved_count_week / marked) * 100 : 0;
              return { ...p, marked_count_week: marked, pending_count_week: pending, completion_percent_week: completion };
            })
            .filter((p) => p.marked_count_week > 0 || p.approved_count_week > 0 || p.rejected_count_week > 0),
        );
        setTransientTaskFeedback(taskId, "error", setTaskFeedback, taskFeedbackTimersRef);
        onFeedbackRef.current?.("Falha ao marcar tarefa", "error");
      } finally {
        setMarkingTaskIds((prev) => prev.filter((id) => id !== taskId));
      }
    },
    [childId, todayIso, markingTaskIds, routineLogs, allTasks],
  );

  return {
    tasks,
    allTasks,
    routineLogs,
    taskProgress,
    tasksLoadError,
    markingTaskIds,
    taskFeedback,
    taskStatusById,
    taskProgressById,
    logsTodayCount,
    todayStatusCounts,
    weeklyLogs,
    groupedWeeklyLogs,
    latestActivityTimestamp,
    onMarkTask,
  };
}
