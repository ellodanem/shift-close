/**
 * deviceClient.js — wrapper around zk-attendance-sdk.
 * Provides connect/disconnect and the two operations we need:
 *   - getAttendances()  → raw punch records
 *   - setUser()         → push a staff member to the device
 *   - getUsers()        → pull all device users
 */

const ZKAttendanceClient = require('zk-attendance-sdk')

class DeviceClient {
  constructor(ip, port = 4370) {
    this.ip = ip
    this.port = port
    this.client = null
  }

  async connect() {
    if (!this.ip) throw new Error('Device IP not configured. Set it in the dashboard settings.')
    this.client = new ZKAttendanceClient(this.ip, this.port, 5000, 5200)
    await this.client.createSocket()
  }

  async disconnect() {
    if (this.client) {
      try { await this.client.disconnect() } catch {}
      this.client = null
    }
  }

  async getAttendances() {
    if (!this.client) throw new Error('Not connected')
    const result = await this.client.getAttendances()
    return result.data || []
  }

  async getUsers() {
    if (!this.client) throw new Error('Not connected')
    const result = await this.client.getUsers()
    return result.data || []
  }

  async setUser(uid, userid, name, password = '', role = 0, cardno = 0) {
    if (!this.client) throw new Error('Not connected')
    return await this.client.setUser(uid, userid, name, password, role, cardno)
  }

  async testConnection() {
    try {
      await this.connect()
      const info = await this.client.getInfo()
      await this.disconnect()
      return { ok: true, info }
    } catch (err) {
      await this.disconnect()
      return { ok: false, error: err.message }
    }
  }
}

module.exports = DeviceClient
