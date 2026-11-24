import {container} from "tsyringe";

export default defineNuxtPlugin(nuxtApp => nuxtApp.provide('ioc', container));
