
import axios from 'axios';
import { URL, TIMEOUT_SEC } from '../utils/constant';

const client = axios.create({
  baseURL: URL,
  timeout: TIMEOUT_SEC * 1000,
});

client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      const message = error.response.data?.message || `API responded with ${error.response.status}`;
      error.message = message;
    }
    return Promise.reject(error);
  }
);

export default client;
