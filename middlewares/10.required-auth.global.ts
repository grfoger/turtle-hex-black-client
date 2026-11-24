import {AuthService} from "~/modules/auth/auth.service";
import {useIOC} from "~/modules/ioc/useIOC";




export default defineNuxtRouteMiddleware((to, from) => {
    const {meta: {requiresAuth = true}, name, path} = to;

    console.log('catched')

    //const authService = useIOC(AuthService);

    //if(name !== 'auth' && !authService.isLoggedIn) return 'auth';
});
