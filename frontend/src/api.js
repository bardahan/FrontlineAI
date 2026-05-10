import axios from 'axios'

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000'

const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
})

export const getSettings = () => api.get('/api/settings').then(r => r.data)
export const updateSettings = (data) => api.put('/api/settings', data).then(r => r.data)

export const getGeminiVoices = () => api.get('/api/gemini-voices').then(r => r.data)
export const getTwilioNumbers = () => api.get('/api/twilio-numbers').then(r => r.data)
export const claimTwilioNumber = (twilio_number) =>
  api.post('/api/settings/claim-twilio-number', { twilio_number }).then(r => r.data)

export const getCalls = (page = 1, limit = 20) =>
  api.get('/api/calls', { params: { page, limit } }).then(r => r.data)
export const getCall = (id) => api.get(`/api/calls/${id}`).then(r => r.data)
export const deleteCall = (id) => api.delete(`/api/calls/${id}`).then(r => r.data)

export const getMe = () => api.get('/auth/me').then(r => r.data)
export const logoutApi = () => api.post('/auth/logout').then(r => r.data)

export const getTools = () => api.get('/api/tools').then(r => r.data)
export const disconnectTool = (name) => api.delete(`/api/tools/${name}`).then(r => r.data)
