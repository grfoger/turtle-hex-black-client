import axios from "axios";

export class HttpClient {

    public async get() {
        return await axios.get('http://localhost:8080/prodlist');
    }

    public async post(data: string[]) {
        return await axios.post('http://localhost:8080/prodlist', data);
    }
}