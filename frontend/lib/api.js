import axios from "axios";

const API_BASE = "http://localhost:5000";

export const api = axios.create({ baseURL: API_BASE });

export const getClusters = () => api.get("/clusters").then(r => r.data);
export const getClusterDetail = (id) => api.get(`/clusters/${id}`).then(r => r.data);
export const getTimeline = () => api.get("/timeline").then(r => r.data);
export const triggerIngest = () => api.post("/ingest/trigger").then(r => r.data);
export const getIngestStatus = (jobId) => api.get(`/ingest/status/${jobId}`).then(r => r.data);
