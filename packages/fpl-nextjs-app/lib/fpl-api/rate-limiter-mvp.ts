// lib/fpl-api/rate-limiter-mvp.ts

import { APILimits } from '@/types/fpl-mvp';

interface RateLimitWindow {
  count: number;
  resetTime: number;
}

export class RateLimiter {
  private minuteWindow: RateLimitWindow = { count: 0, resetTime: 0 };
  private hourWindow: RateLimitWindow = { count: 0, resetTime: 0 };
  private dayWindow: RateLimitWindow = { count: 0, resetTime: 0 };

  constructor(private limits: APILimits) {}

  async checkLimit(): Promise<boolean> {
    const now = Date.now();

    // Reset windows if expired
    if (now > this.minuteWindow.resetTime) {
      this.minuteWindow = { count: 0, resetTime: now + 60 * 1000 };
    }
    if (now > this.hourWindow.resetTime) {
      this.hourWindow = { count: 0, resetTime: now + 60 * 60 * 1000 };
    }
    if (now > this.dayWindow.resetTime) {
      this.dayWindow = { count: 0, resetTime: now + 24 * 60 * 60 * 1000 };
    }

    // Check all limits
    if (this.minuteWindow.count >= this.limits.requestsPerMinute) {
      return false;
    }
    if (this.hourWindow.count >= this.limits.requestsPerHour) {
      return false;
    }
    if (this.dayWindow.count >= this.limits.requestsPerDay) {
      return false;
    }

    // Increment counters
    this.minuteWindow.count++;
    this.hourWindow.count++;
    this.dayWindow.count++;

    return true;
  }

  getNextAvailableTime(): number {
    const now = Date.now();
    const times = [];

    if (this.minuteWindow.count >= this.limits.requestsPerMinute) {
      times.push(this.minuteWindow.resetTime);
    }
    if (this.hourWindow.count >= this.limits.requestsPerHour) {
      times.push(this.hourWindow.resetTime);
    }
    if (this.dayWindow.count >= this.limits.requestsPerDay) {
      times.push(this.dayWindow.resetTime);
    }

    return times.length > 0 ? Math.min(...times) : now;
  }

  getRemainingRequests(): {
    minute: number;
    hour: number;
    day: number;
  } {
    return {
      minute: Math.max(0, this.limits.requestsPerMinute - this.minuteWindow.count),
      hour: Math.max(0, this.limits.requestsPerHour - this.hourWindow.count),
      day: Math.max(0, this.limits.requestsPerDay - this.dayWindow.count)
    };
  }
}