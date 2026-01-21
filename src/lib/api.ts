// Make.com Webhook URLs
const WEBHOOKS = {
  timeclock: "https://hook.us1.make.com/s18wy9mdtycogijuy774ya870fc7rcr6",
  status: "https://hook.us1.make.com/77p47he4rv3y6x005p5dsong3wkpo3p3",
  technicians: "https://hook.us1.make.com/t7bpro4mjh5et17xyfww7mujmzfsuanp",
  mileage: "https://hook.us1.make.com/9eond226tb432cpwyu9fg1n5uijn3o4r",
  history: "https://hook.us1.make.com/vaupr44q2xo1kla8y5a4u2qouv6t89qc",
  editEntry: "https://hook.us1.make.com/7r3y3iedkxgjro2lmj2alqvv2lf7fd9b",
};

// Types
export interface Technician {
  name: string;
  hourly_rate?: number;
  fixed_route_miles?: number;
}

export interface ClockResponse {
  success: boolean;
  shift_id?: string;
  hours_worked?: number;
  error?: string;
}

export interface StatusResponse {
  clocked_in: boolean;
  clock_in_time?: string;
  elapsed_minutes?: number;
}

export interface MileageResponse {
  success: boolean;
  entry_id?: string;
  error?: string;
}

export interface TimeEntry {
  shift_id: string;
  date: string;
  clock_in: string;
  clock_out: string | null;
  hours_worked: number | null;
  edited: boolean;
}

export interface MileageEntry {
  entry_id: string;
  date: string;
  miles: number;
  description: string;
}

export interface HistoryResponse {
  time_entries: TimeEntry[];
  mileage_entries: MileageEntry[];
  week_total_hours: number;
}

// API Functions

export async function fetchTechnicians(): Promise<Technician[]> {
  try {
    const response = await fetch(WEBHOOKS.technicians, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data.technicians || data || [];
  } catch (error) {
    console.error("Failed to fetch technicians:", error);
    // Return fallback technicians if webhook fails
    return [{ name: "Bri" }, { name: "Nick" }];
  }
}

export async function clockIn(techName: string): Promise<ClockResponse> {
  try {
    const response = await fetch(WEBHOOKS.timeclock, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tech_name: techName,
        action: "clock_in",
        timestamp: new Date().toISOString(),
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    // Handle different response formats from Make.com
    const text = await response.text();

    // If response is "Accepted" or empty, treat as success
    if (text === "Accepted" || text === "" || response.status === 200) {
      const today = new Date();
      const dateStr = today.toISOString().split("T")[0];
      return {
        success: true,
        shift_id: `${dateStr}_${techName}`
      };
    }

    // Try to parse as JSON
    try {
      return JSON.parse(text);
    } catch {
      // If not JSON but got 200, treat as success
      return { success: true };
    }
  } catch (error) {
    console.error("Failed to clock in:", error);
    return { success: false, error: "Failed to connect. Please try again." };
  }
}

export async function clockOut(techName: string): Promise<ClockResponse> {
  try {
    const response = await fetch(WEBHOOKS.timeclock, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tech_name: techName,
        action: "clock_out",
        timestamp: new Date().toISOString(),
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    // Handle different response formats from Make.com
    const text = await response.text();

    // If response is "Accepted" or empty, treat as success
    if (text === "Accepted" || text === "" || response.status === 200) {
      return { success: true };
    }

    // Try to parse as JSON
    try {
      return JSON.parse(text);
    } catch {
      return { success: true };
    }
  } catch (error) {
    console.error("Failed to clock out:", error);
    return { success: false, error: "Failed to connect. Please try again." };
  }
}

export async function checkStatus(techName: string): Promise<StatusResponse> {
  try {
    const response = await fetch(`${WEBHOOKS.status}?tech_name=${encodeURIComponent(techName)}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error("Failed to check status:", error);
    return { clocked_in: false };
  }
}

export async function submitMileage(
  techName: string,
  date: string,
  miles: number,
  description: string
): Promise<MileageResponse> {
  try {
    const response = await fetch(WEBHOOKS.mileage, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tech_name: techName,
        date,
        miles,
        description,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    // Handle different response formats from Make.com
    const text = await response.text();

    // If response is "Accepted" or empty, treat as success
    if (text === "Accepted" || text === "" || response.status === 200) {
      return {
        success: true,
        entry_id: `mileage_${Date.now()}`
      };
    }

    // Try to parse as JSON
    try {
      return JSON.parse(text);
    } catch {
      return { success: true };
    }
  } catch (error) {
    console.error("Failed to submit mileage:", error);
    return { success: false, error: "Failed to connect. Please try again." };
  }
}

export async function fetchHistory(techName: string, days: number = 14): Promise<HistoryResponse> {
  try {
    const response = await fetch(
      `${WEBHOOKS.history}?tech_name=${encodeURIComponent(techName)}&days=${days}`,
      {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error("Failed to fetch history:", error);
    return { time_entries: [], mileage_entries: [], week_total_hours: 0 };
  }
}

export async function editEntry(
  techName: string,
  shiftId: string,
  field: string,
  oldValue: string,
  newValue: string,
  reason: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(WEBHOOKS.editEntry, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tech_name: techName,
        shift_id: shiftId,
        field,
        old_value: oldValue,
        new_value: newValue,
        reason,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    // Handle different response formats from Make.com
    const text = await response.text();

    // If response is "Accepted" or empty, treat as success
    if (text === "Accepted" || text === "" || response.status === 200) {
      return { success: true };
    }

    // Try to parse as JSON
    try {
      return JSON.parse(text);
    } catch {
      return { success: true };
    }
  } catch (error) {
    console.error("Failed to edit entry:", error);
    return { success: false, error: "Failed to connect. Please try again." };
  }
}
