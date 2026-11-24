import axios from "axios";

export class TileClient {
  private readonly client = axios.create({
    baseURL: import.meta.env.VITE_API_BASE_URL,
    timeout: 10000,
    headers: {
      'Content-Type': 'application/json',
    },
  })

  async GetHello() {
    return (await this.client.get("/tile")).data
  }
}
