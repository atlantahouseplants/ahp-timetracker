"use client";

import { useState, useEffect, useCallback } from "react";

// Hardcoded technician list (will be replaced with Make.com webhook later)
const TECHNICIANS = ["Bri", "Nick"];

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
  // Round to nearest 0.25
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
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [clockState, setClockState] = useState<ClockState>({
    isClockedIn: false,
    clockInTime: null,
  });
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [mileageEntries, setMileageEntries] = useState<MileageEntry[]>([]);
  const [currentScreen, setCurrentScreen] = useState<Screen>("home");
  const [isLoading, setIsLoading] = useState(true);
  const [showConfirmation, setShowConfirmation] = useState<string | null>(null);
  const [isButtonDisabled, setIsButtonDisabled] = useState(false);
  const [elapsedTime, setElapsedTime] = useState<string>("");

  // Mileage form state
  const [mileageDate, setMileageDate] = useState(formatDate(new Date()));
  const [mileageMiles, setMileageMiles] = useState("");
  const [mileageDescription, setMileageDescription] = useState("");

  // Load data from localStorage on mount
  useEffect(() => {
    const savedUser = localStorage.getItem("ahp_current_user");
    const savedClockState = localStorage.getItem("ahp_clock_state");
    const savedTimeEntries = localStorage.getItem("ahp_time_entries");
    const savedMileageEntries = localStorage.getItem("ahp_mileage_entries");

    if (savedUser) setCurrentUser(savedUser);
    if (savedClockState) setClockState(JSON.parse(savedClockState));
    if (savedTimeEntries) setTimeEntries(JSON.parse(savedTimeEntries));
    if (savedMileageEntries) setMileageEntries(JSON.parse(savedMileageEntries));

    setIsLoading(false);
  }, []);

  // Save clock state to localStorage when it changes
  useEffect(() => {
    if (!isLoading) {
      localStorage.setItem("ahp_clock_state", JSON.stringify(clockState));
    }
  }, [clockState, isLoading]);

  // Save time entries to localStorage when they change
  useEffect(() => {
    if (!isLoading) {
      localStorage.setItem("ahp_time_entries", JSON.stringify(timeEntries));
    }
  }, [timeEntries, isLoading]);

  // Save mileage entries to localStorage when they change
  useEffect(() => {
    if (!isLoading) {
      localStorage.setItem("ahp_mileage_entries", JSON.stringify(mileageEntries));
    }
  }, [mileageEntries, isLoading]);

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
  };

  // Clock in handler
  const handleClockIn = useCallback(() => {
    if (isButtonDisabled) return;
    setIsButtonDisabled(true);

    const now = new Date();
    const clockInTime = now.toISOString();

    // Create new time entry
    const newEntry: TimeEntry = {
      shiftId: `${formatDate(now)}_${currentUser}`,
      date: formatDate(now),
      clockIn: clockInTime,
      clockOut: null,
      hoursWorked: null,
    };

    setTimeEntries((prev) => [...prev, newEntry]);
    setClockState({
      isClockedIn: true,
      clockInTime: clockInTime,
    });
    setElapsedTime(getElapsedTime(clockInTime));

    // Show confirmation
    setShowConfirmation(`Clocked in at ${formatTime(now)}`);
    setTimeout(() => setShowConfirmation(null), 3000);

    // Re-enable button after 2 seconds
    setTimeout(() => setIsButtonDisabled(false), 2000);
  }, [currentUser, isButtonDisabled]);

  // Clock out handler
  const handleClockOut = useCallback(() => {
    if (isButtonDisabled) return;
    setIsButtonDisabled(true);

    const now = new Date();
    const clockOutTime = now.toISOString();

    // Update today's entry
    setTimeEntries((prev) => {
      const updated = [...prev];
      const todayIndex = updated.findIndex(
        (entry) => entry.shiftId === `${formatDate(now)}_${currentUser}`
      );
      if (todayIndex !== -1) {
        updated[todayIndex] = {
          ...updated[todayIndex],
          clockOut: clockOutTime,
          hoursWorked: calculateHoursWorked(
            updated[todayIndex].clockIn,
            clockOutTime
          ),
        };
      }
      return updated;
    });

    const hoursWorked = clockState.clockInTime
      ? calculateHoursWorked(clockState.clockInTime, clockOutTime)
      : 0;

    setClockState({
      isClockedIn: false,
      clockInTime: null,
    });

    // Show confirmation
    setShowConfirmation(`Clocked out. You worked ${hoursWorked}h today.`);
    setTimeout(() => setShowConfirmation(null), 3000);

    // Re-enable button after 2 seconds
    setTimeout(() => setIsButtonDisabled(false), 2000);
  }, [currentUser, clockState.clockInTime, isButtonDisabled]);

  // Mileage submit handler
  const handleMileageSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const newEntry: MileageEntry = {
      entryId: `mileage_${Date.now()}`,
      date: mileageDate,
      miles: parseFloat(mileageMiles),
      description: mileageDescription,
    };

    setMileageEntries((prev) => [...prev, newEntry]);
    localStorage.setItem(
      "ahp_mileage_entries",
      JSON.stringify([...mileageEntries, newEntry])
    );

    // Reset form and go back
    setMileageDate(formatDate(new Date()));
    setMileageMiles("");
    setMileageDescription("");
    setCurrentScreen("home");

    setShowConfirmation("Mileage entry saved");
    setTimeout(() => setShowConfirmation(null), 3000);
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

          <div className="space-y-3">
            {TECHNICIANS.map((name) => (
              <button
                key={name}
                onClick={() => selectUser(name)}
                className="w-full rounded-xl bg-white p-4 text-lg font-medium text-gray-900 shadow-sm ring-1 ring-gray-200 transition-all active:scale-[0.98] active:bg-gray-50"
              >
                {name}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Mileage entry screen
  if (currentScreen === "mileage") {
    return (
      <div className="flex min-h-screen flex-col px-6 py-8 safe-bottom">
        <div className="mb-6 flex items-center">
          <button
            onClick={() => setCurrentScreen("home")}
            className="mr-4 text-gray-600"
          >
            <svg
              className="h-6 w-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </button>
          <h1 className="text-xl font-bold text-gray-900">Add Mileage</h1>
        </div>

        <form onSubmit={handleMileageSubmit} className="flex-1 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Date
            </label>
            <input
              type="date"
              value={mileageDate}
              onChange={(e) => setMileageDate(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Miles
            </label>
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
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Description
            </label>
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
            className="mt-6 w-full rounded-xl bg-green-600 py-4 text-lg font-semibold text-white transition-all active:scale-[0.98] active:bg-green-700"
          >
            Save Mileage
          </button>
        </form>
      </div>
    );
  }

  // History screen
  if (currentScreen === "history") {
    const userTimeEntries = timeEntries
      .filter((entry) => entry.shiftId.endsWith(`_${currentUser}`))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const userMileageEntries = mileageEntries.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    return (
      <div className="flex min-h-screen flex-col px-6 py-8 safe-bottom">
        <div className="mb-6 flex items-center">
          <button
            onClick={() => setCurrentScreen("home")}
            className="mr-4 text-gray-600"
          >
            <svg
              className="h-6 w-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </button>
          <h1 className="text-xl font-bold text-gray-900">My History</h1>
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
                          {entry.hoursWorked !== null
                            ? `${entry.hoursWorked}h`
                            : "--"}
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
                        <p className="font-medium text-gray-900">
                          {entry.description}
                        </p>
                        <p className="text-sm text-gray-500">{entry.date}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-semibold text-gray-900">
                          {entry.miles} mi
                        </p>
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
  const weekTotal = getWeekTotal(
    timeEntries.filter((e) => e.shiftId.endsWith(`_${currentUser}`))
  );

  const thisWeekEntries = timeEntries
    .filter((entry) => {
      const now = new Date();
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - now.getDay());
      startOfWeek.setHours(0, 0, 0, 0);
      const entryDate = new Date(entry.date);
      return entryDate >= startOfWeek && entry.shiftId.endsWith(`_${currentUser}`);
    })
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return (
    <div className="flex min-h-screen flex-col px-6 py-8 safe-bottom">
      {/* Confirmation toast */}
      {showConfirmation && (
        <div className="fixed left-1/2 top-4 z-50 -translate-x-1/2 transform">
          <div className="flex items-center gap-2 rounded-full bg-green-600 px-4 py-2 text-white shadow-lg">
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
            <span className="text-sm font-medium">{showConfirmation}</span>
          </div>
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
            {clockState.clockInTime &&
              formatTime(new Date(clockState.clockInTime))}{" "}
            ({elapsedTime})
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
            <span className="text-2xl font-bold text-gray-900">
              {weekTotal}h
            </span>
          </div>

          {thisWeekEntries.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {thisWeekEntries.map((entry) => (
                <div
                  key={entry.shiftId}
                  className="rounded-lg bg-gray-100 px-3 py-1 text-sm"
                >
                  <span className="font-medium text-gray-700">
                    {getDayName(entry.date)}:
                  </span>{" "}
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
