import axios from "axios";
import { useEffect } from "react";
import { useNavigate } from 'react-router-dom';
import useAuth from "./useAuth";

const axiosSecure = axios.create({
    baseURL: import.meta.env.VITE_API_URL,
    withCredentials: true
})

const useAxiosSecure = () => {
    const navigate = useNavigate()
    const { logOut } = useAuth();
    useEffect(() => {
        axiosSecure.interceptors.response.use(response => {
            return response;
        }, async error => {
            if (error.response.status === 401 || error.response.status === 403) {
                //logout
                logOut()
                //navigate to login
                navigate('/login')
            }
        })
    }, [logOut, navigate])
    return axiosSecure;
}

export default useAxiosSecure