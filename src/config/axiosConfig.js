import axios from "axios";
import { store } from "../store/store";
import { logoutUser } from "@/store/slices/userSlice";

// Create an Axios instance
const axiosInstance = axios.create({
  baseURL: "https://backend.codemy.jayadevnair.in",
  withCredentials: true,
});

// Add a request interceptor
axiosInstance.interceptors.request.use(
  (config) => {
    const accessToken = localStorage.getItem("accessToken");
    const refreshToken = localStorage.getItem("refreshToken");

    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }

    if (refreshToken) {
      config.headers["x-refresh-token"] = refreshToken;
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Add a response interceptor
axiosInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 403) {
      console.error("Unauthorized! Redirecting to login...");

      localStorage.removeItem("accessToken");
      localStorage.removeItem("refreshToken");
      store.dispatch(clearUser(user));

      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

export default axiosInstance;
