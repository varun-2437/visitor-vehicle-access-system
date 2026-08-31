import axios from "axios";

const getBaseURL = () => {
  const hostname = window.location.hostname || "localhost";
  return `http://${hostname}:8000`;
};

const API = axios.create({
  baseURL: getBaseURL(),
});

// Attach JWT token to every request
API.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Auto-logout on 401 (except on the login endpoint itself)
API.interceptors.response.use(
  (response) => response,
  (error) => {
    const isLoginEndpoint = error.config?.url?.includes("/api/auth/login");
    if (error.response?.status === 401 && !isLoginEndpoint) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

export default API;
