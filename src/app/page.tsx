"use client";

import { useState, useEffect, useCallback } from "react";
import {
  fetchTechnicians,
  checkStatus,
  clockIn,
  clockOut,
  submitMileage,
  fetchHistory,
  type Technician,
  type TimeEntry as APITimeEntry,
  type MileageEntry as APIMileageEntry,
} from "@/lib/api";

// Types
interface ClockState {
  isClockedIn: boolean;
  clockInTime: string | null;
}

interface TimeEntry {
  shiftId: string;
  date: string;
  clockIn: string;
  clockOut: string | null;
  hoursWorked: number | null;
}

interface MileageEntry {
  entryId: string;
  date: string;
  miles: number;
  description: string;
}

type Screen = "home" | "mileage" | "history";

// Helper functions
function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

function getElapsedTime(clockInTime: string): string {
  const start = new Date(clockInTime);
  const now = new Date();
  const diffMs = now.getTime() - start.getTime();
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

function calculateHoursWorked(clockIn: string, clockOut: string): number {
  const start = new Date(clockIn);
  const end = new Date(clockOut);
  const diffHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
  return Math.round(diffHours * 4) / 4;
}

function getWeekTotal(entries: TimeEntry[]): number {
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);

  return entries
    .filter((entry) => {
      const entryDate = new Date(entry.date);
      return entryDate >= startOfWeek && entry.hoursWorked !== null;
    })
    .reduce((sum, entry) => sum + (entry.hoursWorked || 0), 0);
}

function getDayName(dateStr: string): string {
  const date = new Date(dateStr + "T12:00:00");
  return date.toLocaleDateString("en-US", { weekday: "short" });
}

export default function Home() {
  // App state
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [clockState, setClockState] = useState<ClockState>({
    isClockedIn: false,
    clockInTime: null,
  });
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [mileageEntries, setMileageEntries] = useState<MileageEntry[]>([]);
  const [weekTotalHours, setWeekTotalHours] = useState<number>(0);
  const [currentScreen, setCurrentScreen] = useState<Screen>("home");
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingTechnicians, setIsLoadingTechnicians] = useState(true);
  const [showConfirmation, setShowConfirmation] = useState<string | null>(null);
  const [showError, setShowError] = useState<string | null>(null);
  const [isButtonDisabled, setIsButtonDisabled] = useState(false);
  const [elapsedTime, setElapsedTime] = useState<string>("");
  const [pendingActions, setPendingActions] = useState<number>(0);

  // Mileage form state
  const [mileageDate, setMileageDate] = useState(formatDate(new Date()));
  const [mileageMiles, setMileageMiles] = useState("");
  const [mileageDescription, setMileageDescription] = useState("");
  const [isSubmittingMileage, setIsSubmittingMileage] = useState(false);

  // Load technicians on mount
  useEffect(() => {
    async function loadTechnicians() {
      setIsLoadingTechnicians(true);
      const techs = await fetchTechnicians();
      setTechnicians(techs);
      setIsLoadingTechnicians(false);
    }
    loadTechnicians();
  }, []);

  // Load user from localStorage on mount
  useEffect(() => {
    const savedUser = localStorage.getItem("ahp_current_user");
    if (savedUser) {
      setCurrentUser(savedUser);
    }
    setIsLoading(false);
  }, []);

  // Check status and fetch history when user is set
  useEffect(() => {
    if (!currentUser) return;

    async function loadUserData() {
      // Check clock status
      const status = await checkStatus(currentUser!);
      if (status.clocked_in && status.clock_in_time) {
        setClockState({
          isClockedIn: true,
          clockInTime: status.clock_in_time,
        });
        setElapsedTime(getElapsedTime(status.clock_in_time));
      } else {
        setClockState({
          isClockedIn: false,
          clockInTime: null,
        });
      }

      // Fetch history
      const history = await fetchHistory(currentUser!);

      // Convert API format to local format
      const timeEntriesLocal: TimeEntry[] = history.time_entries.map((entry: APITimeEntry) => ({
        shiftId: entry.shift_id,
        date: entry.date,
        clockIn: entry.clock_in,
        clockOut: entry.clock_out,
        hoursWorked: entry.hours_worked,
      }));

      const mileageEntriesLocal: MileageEntry[] = history.mileage_entries.map((entry: APIMileageEntry) => ({
        entryId: entry.entry_id,
        date: entry.date,
        miles: entry.miles,
        description: entry.description,
      }));

      setTimeEntries(timeEntriesLocal);
      setMileageEntries(mileageEntriesLocal);
      setWeekTotalHours(history.week_total_hours);
    }

    loadUserData();
  }, [currentUser]);

  // Update elapsed time every minute when clocked in
  useEffect(() => {
    if (clockState.isClockedIn && clockState.clockInTime) {
      setElapsedTime(getElapsedTime(clockState.clockInTime));
      const interval = setInterval(() => {
        setElapsedTime(getElapsedTime(clockState.clockInTime!));
      }, 60000);
      return () => clearInterval(interval);
    }
  }, [clockState.isClockedIn, clockState.clockInTime]);

  // User selection handler
  const selectUser = (name: string) => {
    setCurrentUser(name);
    localStorage.setItem("ahp_current_user", name);
  };

  // Switch user handler
  const switchUser = () => {
    setCurrentUser(null);
    localStorage.removeItem("ahp_current_user");
    setClockState({ isClockedIn: false, clockInTime: null });
    setTimeEntries([]);
    setMileageEntries([]);
    setWeekTotalHours(0);
  };

  // Clock in handler
  const handleClockIn = useCallback(async () => {
    if (isButtonDisabled || !currentUser) return;
    setIsButtonDisabled(true);

    const now = new Date();
    const clockInTime = now.toISOString();

    // Optimistic update
    setClockState({
      isClockedIn: true,
      clockInTime: clockInTime,
    });
    setElapsedTime(getElapsedTime(clockInTime));
    setShowConfirmation(`Clocked in at ${formatTime(now)}`);

    // Call API
    const response = await clockIn(currentUser);

    if (!response.success) {
      // Revert on failure
      setClockState({
        isClockedIn: false,
        clockInTime: null,
      });
      setShowConfirmation(null);
      setShowError(response.error || "Failed to clock in");
      setTimeout(() => setShowError(null), 4000);
    } else {
      // Add local entry for immediate display
      const newEntry: TimeEntry = {
        shiftId: response.shift_id || `${formatDate(now)}_${currentUser}`,
        date: formatDate(now),
        clockIn: clockInTime,
        clockOut: null,
        hoursWorked: null,
      };
      setTimeEntries((prev) => [newEntry, ...prev.filter(e => e.shiftId !== newEntry.shiftId)]);
      setTimeout(() => setShowConfirmation(null), 3000);
    }

    setTimeout(() => setIsButtonDisabled(false), 2000);
  }, [currentUser, isButtonDisabled]);

  // Clock out handler
  const handleClockOut = useCallback(async () => {
    if (isButtonDisabled || !currentUser) return;
    setIsButtonDisabled(true);

    const now = new Date();
    const clockOutTime = now.toISOString();
    const prevClockInTime = clockState.clockInTime;

    // Calculate hours for optimistic display
    const hoursWorked = prevClockInTime
      ? calculateHoursWorked(prevClockInTime, clockOutTime)
      : 0;

    // Optimistic update
    setClockState({
      isClockedIn: false,
      clockInTime: null,
    });
    setShowConfirmation(`Clocked out. You worked ${hoursWorked}h today.`);

    // Call API
    const response = await clockOut(currentUser);

    if (!response.success) {
      // Revert on failure
      setClockState({
        isClockedIn: true,
        clockInTime: prevClockInTime,
      });
      setShowConfirmation(null);
      setShowError(response.error || "Failed to clock out");
      setTimeout(() => setShowError(null), 4000);
    } else {
      // Update local entry
      const actualHours = response.hours_worked ?? hoursWorked;
      setTimeEntries((prev) => {
        const updated = [...prev];
        const todayIndex = updated.findIndex(
          (entry) => entry.date === formatDate(now) && entry.clockOut === null
        );
        if (todayIndex !== -1) {
          updated[todayIndex] = {
            ...updated[todayIndex],
            clockOut: clockOutTime,
            hoursWorked: actualHours,
          };
        }
        return updated;
      });
      setWeekTotalHours((prev) => prev + actualHours);
      setTimeout(() => setShowConfirmation(null), 3000);
    }

    setTimeout(() => setIsButtonDisabled(false), 2000);
  }, [currentUser, clockState.clockInTime, isButtonDisabled]);

  // Mileage submit handler
  const handleMileageSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || isSubmittingMileage) return;

    setIsSubmittingMileage(true);

    const response = await submitMileage(
      currentUser,
      mileageDate,
      parseFloat(mileageMiles),
      mileageDescription
    );

    if (response.success) {
      // Add to local state
      const newEntry: MileageEntry = {
        entryId: response.entry_id || `mileage_${Date.now()}`,
        date: mileageDate,
        miles: parseFloat(mileageMiles),
        description: mileageDescription,
      };
      setMileageEntries((prev) => [newEntry, ...prev]);

      // Reset form and go back
      setMileageDate(formatDate(new Date()));
      setMileageMiles("");
      setMileageDescription("");
      setCurrentScreen("home");

      setShowConfirmation("Mileage entry saved");
      setTimeout(() => setShowConfirmation(null), 3000);
    } else {
      setShowError(response.error || "Failed to save mileage");
      setTimeout(() => setShowError(null), 4000);
    }

    setIsSubmittingMileage(false);
  };

  // Refresh history
  const refreshHistory = async () => {
    if (!currentUser) return;
    const history = await fetchHistory(currentUser);

    const timeEntriesLocal: TimeEntry[] = history.time_entries.map((entry: APITimeEntry) => ({
      shiftId: entry.shift_id,
      date: entry.date,
      clockIn: entry.clock_in,
      clockOut: entry.clock_out,
      hoursWorked: entry.hours_worked,
    }));

    const mileageEntriesLocal: MileageEntry[] = history.mileage_entries.map((entry: APIMileageEntry) => ({
      entryId: entry.entry_id,
      date: entry.date,
      miles: entry.miles,
      description: entry.description,
    }));

    setTimeEntries(timeEntriesLocal);
    setMileageEntries(mileageEntriesLocal);
    setWeekTotalHours(history.week_total_hours);
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-green-600 border-t-transparent"></div>
      </div>
    );
  }

  // User selection screen
  if (!currentUser) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-6">
        <div className="w-full max-w-sm">
          <h1 className="mb-2 text-center text-2xl font-bold text-gray-900">
            Atlanta Houseplants
          </h1>
          <p className="mb-8 text-center text-lg text-gray-600">Who are you?</p>

          {isLoadingTechnicians ? (
            <div className="flex justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-green-600 border-t-transparent"></div>
            </div>
          ) : (
            <div className="space-y-3">
              {technicians.map((tech) => (
                <button
                  key={tech.name}
                  onClick={() => selectUser(tech.name)}
                  className="w-full rounded-xl bg-white p-4 text-lg font-medium text-gray-900 shadow-sm ring-1 ring-gray-200 transition-all active:scale-[0.98] active:bg-gray-50"
                >
                  {tech.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Mileage entry screen
  if (currentScreen === "mileage") {
    return (
      <div className="flex min-h-screen flex-col px-6 py-8 safe-bottom">
        {/* Error toast */}
        {showError && (
          <div className="fixed left-1/2 top-4 z-50 -translate-x-1/2 transform">
            <div className="flex items-center gap-2 rounded-full bg-red-600 px-4 py-2 text-white shadow-lg">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              <span className="text-sm font-medium">{showError}</span>
            </div>
          </div>
        )}

        <div className="mb-6 flex items-center">
          <button
            onClick={() => setCurrentScreen("home")}
            className="mr-4 text-gray-600"
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-xl font-bold text-gray-900">Add Mileage</h1>
        </div>

        <form onSubmit={handleMileageSubmit} className="flex-1 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Date</label>
            <input
              type="date"
              value={mileageDate}
              onChange={(e) => setMileageDate(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Miles</label>
            <input
              type="number"
              step="0.1"
              min="0"
              value={mileageMiles}
              onChange={(e) => setMileageMiles(e.target.value)}
              placeholder="0.0"
              className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Description</label>
            <input
              type="text"
              value={mileageDescription}
              onChange={(e) => setMileageDescription(e.target.value)}
              placeholder="e.g., Plant doctor - Acme Corp"
              className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
              required
            />
          </div>

          <button
            type="submit"
            disabled={isSubmittingMileage}
            className="mt-6 w-full rounded-xl bg-green-600 py-4 text-lg font-semibold text-white transition-all active:scale-[0.98] active:bg-green-700 disabled:opacity-70"
          >
            {isSubmittingMileage ? "Saving..." : "Save Mileage"}
          </button>
        </form>
      </div>
    );
  }

  // History screen
  if (currentScreen === "history") {
    const userTimeEntries = timeEntries
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const userMileageEntries = mileageEntries
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return (
      <div className="flex min-h-screen flex-col px-6 py-8 safe-bottom">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center">
            <button
              onClick={() => setCurrentScreen("home")}
              className="mr-4 text-gray-600"
            >
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 className="text-xl font-bold text-gray-900">My History</h1>
          </div>
          <button
            onClick={refreshHistory}
            className="text-green-600"
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>

        <div className="space-y-6">
          {/* Time Entries */}
          <div>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
              Time Entries
            </h2>
            {userTimeEntries.length === 0 ? (
              <p className="text-gray-500">No time entries yet</p>
            ) : (
              <div className="space-y-2">
                {userTimeEntries.map((entry) => (
                  <div
                    key={entry.shiftId}
                    className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-gray-200"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-gray-900">
                          {getDayName(entry.date)}, {entry.date}
                        </p>
                        <p className="text-sm text-gray-500">
                          {formatTime(new Date(entry.clockIn))}
                          {entry.clockOut
                            ? ` - ${formatTime(new Date(entry.clockOut))}`
                            : " - In progress"}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-semibold text-gray-900">
                          {entry.hoursWorked !== null ? `${entry.hoursWorked}h` : "--"}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Mileage Entries */}
          <div>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
              Mileage Entries
            </h2>
            {userMileageEntries.length === 0 ? (
              <p className="text-gray-500">No mileage entries yet</p>
            ) : (
              <div className="space-y-2">
                {userMileageEntries.map((entry) => (
                  <div
                    key={entry.entryId}
                    className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-gray-200"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-gray-900">{entry.description}</p>
                        <p className="text-sm text-gray-500">{entry.date}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-semibold text-gray-900">{entry.miles} mi</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Home screen
  const weekTotal = weekTotalHours || getWeekTotal(timeEntries);

  const thisWeekEntries = timeEntries
    .filter((entry) => {
      const now = new Date();
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - now.getDay());
      startOfWeek.setHours(0, 0, 0, 0);
      const entryDate = new Date(entry.date);
      return entryDate >= startOfWeek;
    })
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return (
    <div className="flex min-h-screen flex-col px-6 py-8 safe-bottom">
      {/* Confirmation toast */}
      {showConfirmation && (
        <div className="fixed left-1/2 top-4 z-50 -translate-x-1/2 transform">
          <div className="flex items-center gap-2 rounded-full bg-green-600 px-4 py-2 text-white shadow-lg">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span className="text-sm font-medium">{showConfirmation}</span>
          </div>
        </div>
      )}

      {/* Error toast */}
      {showError && (
        <div className="fixed left-1/2 top-4 z-50 -translate-x-1/2 transform">
          <div className="flex items-center gap-2 rounded-full bg-red-600 px-4 py-2 text-white shadow-lg">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            <span className="text-sm font-medium">{showError}</span>
          </div>
        </div>
      )}

      {/* Pending sync indicator */}
      {pendingActions > 0 && (
        <div className="mb-4 flex items-center justify-center gap-2 text-sm text-amber-600">
          <div className="h-2 w-2 animate-pulse rounded-full bg-amber-500"></div>
          {pendingActions} action{pendingActions > 1 ? "s" : ""} pending sync
        </div>
      )}

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-xl font-bold text-gray-900">Atlanta Houseplants</h1>
        <p className="text-lg text-gray-600">Hey {currentUser} 👋</p>
      </div>

      {/* Clock status */}
      {clockState.isClockedIn && (
        <div className="mb-6 rounded-xl bg-green-50 p-4">
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full bg-green-500"></div>
            <span className="font-medium text-green-800">Clocked in since</span>
          </div>
          <p className="mt-1 text-lg text-green-800">
            {clockState.clockInTime && formatTime(new Date(clockState.clockInTime))} ({elapsedTime})
          </p>
        </div>
      )}

      {/* Main action button */}
      <button
        onClick={clockState.isClockedIn ? handleClockOut : handleClockIn}
        disabled={isButtonDisabled}
        className={`mb-4 w-full rounded-xl py-5 text-xl font-bold text-white shadow-lg transition-all active:scale-[0.98] disabled:opacity-70 ${
          clockState.isClockedIn
            ? "bg-red-500 active:bg-red-600"
            : "bg-green-600 active:bg-green-700"
        }`}
      >
        {clockState.isClockedIn ? "CLOCK OUT" : "CLOCK IN"}
      </button>

      {/* Add mileage button */}
      <button
        onClick={() => setCurrentScreen("mileage")}
        className="mb-8 w-full rounded-xl bg-white py-4 text-lg font-medium text-gray-700 shadow-sm ring-1 ring-gray-200 transition-all active:scale-[0.98] active:bg-gray-50"
      >
        Add Mileage
      </button>

      {/* Weekly summary */}
      <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200">
        <button
          onClick={() => setCurrentScreen("history")}
          className="w-full text-left"
        >
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
              This Week
            </h2>
            <span className="text-2xl font-bold text-gray-900">{weekTotal}h</span>
          </div>

          {thisWeekEntries.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {thisWeekEntries.map((entry) => (
                <div
                  key={entry.shiftId}
                  className="rounded-lg bg-gray-100 px-3 py-1 text-sm"
                >
                  <span className="font-medium text-gray-700">{getDayName(entry.date)}:</span>{" "}
                  <span className="text-gray-600">
                    {entry.hoursWorked !== null ? `${entry.hoursWorked}` : "--"}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">No entries this week</p>
          )}

          <p className="mt-3 text-sm text-green-600">View full history →</p>
        </button>
      </div>

      {/* Switch user link */}
      <div className="mt-auto pt-8">
        <button
          onClick={switchUser}
          className="w-full text-center text-sm text-gray-400"
        >
          Not {currentUser}? Tap to switch
        </button>
      </div>
    </div>
  );
}
