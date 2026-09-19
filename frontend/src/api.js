import axios from "axios";

const getBaseURL = () => {
  const hostname = window.location.hostname || "localhost";
  return `http://${hostname}:8000`;
};

const API = axios.create({
  baseURL: getBaseURL(),
  withCredentials: true, // Necessary to send/receive cookies
  xsrfCookieName: "XSRF-TOKEN",
  xsrfHeaderName: "X-XSRF-TOKEN",
});

// Attach JWT token to every request
API.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  
  // Manually attach CSRF token for cross-origin requests
  if (["post", "put", "patch", "delete"].includes(config.method?.toLowerCase())) {
    const match = document.cookie.match(new RegExp('(^|;\\s*)(XSRF-TOKEN)=([^;]*)'));
    const csrfToken = match ? decodeURIComponent(match[3]) : null;
    if (csrfToken) {
      config.headers["X-XSRF-TOKEN"] = csrfToken;
    }
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
