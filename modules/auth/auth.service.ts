import {singleton} from "tsyringe";

@singleton()
export class AuthService {
    constructor() {
        this._isLoggedIn = false;
    }

    private _isLoggedIn;

   get isLoggedIn(){
       return this._isLoggedIn;
   }

   set isLoggedIn(isLoggedIn:boolean){
       this._isLoggedIn = isLoggedIn;
   }
}
