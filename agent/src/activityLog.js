/**
 * activityLog.js — in-memory circular log of recent agent activity.
 * Shown in the dashboard.
 */

class ActivityLog {
  constructor(maxEntries = 50) {
    this.entries = []
    this.maxEntries = maxEntries
  }

  add(message) {
    this.entries.unshift({
      time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }),
      message
    })
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(0, this.maxEntries)
    }
  }

  getAll() {
    return this.entries
  }
}

module.exports = ActivityLog
