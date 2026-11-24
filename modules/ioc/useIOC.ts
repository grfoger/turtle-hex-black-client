import {type DependencyContainer, type InjectionToken} from 'tsyringe';


export const useIOC = <T>(injectableClass: InjectionToken<T>): T => {
  return (useNuxtApp().$ioc as DependencyContainer).resolve(injectableClass);
};
