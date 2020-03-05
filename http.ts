import { ServerRequest } from "https://deno.land/std/http/server.ts";

export class SSEWriter implements Deno.Reader{
    private readonly buffer: Deno.Buffer;
    private closed: boolean;
    private e = new TextEncoder();
    private _pending : Promise<any>;
    private _pendingResolve: any;
    private _close: Promise<any>;
    private _closeResolve: any;
    private _count = 0;
    private _start = Date.now();
    private _req : ServerRequest;
    
    constructor(req: ServerRequest){
        this._req = req;
        this.buffer = new Deno.Buffer;
        this.closed = false;

        this._close = new Promise((r) =>{
            this._closeResolve = r;
        })
        this._pending = new Promise((r) => {
            this._pendingResolve = r;
        });
    }

    public close(){
        this.closed = true;
        this._closeResolve();
    }

    public emit(event: string, data: any){
        if(typeof data === "object"){
            data['time'] = Date.now() - this._start;
        }
        const raw = "event: " + event + "\ndata: " + JSON.stringify(data);
        return this.write(raw);
    }

    public async write(raw: string){
        console.debug(raw);
        await this.buffer.write(this.e.encode(raw));
        if(this._pendingResolve){
            this._pendingResolve();
        }
        //this._req.w.flush();
        // this._pending = new Promise((resolve) => {
        //     this._pendingResolve = resolve;
        // })
    }
    public async read(p: Uint8Array){
        const result = await this.buffer.read(p);
        if(result === Deno.EOF && !this.closed){
            const d = Date.now();
            console.debug("still waiting:", 0, this._count += 1)
            await new Promise((r)=> setTimeout(r, 100));
            return 0;
        }
        console.debug("read:", result);
        return result;
    }
}

export class Counter implements Deno.Reader{
    private counter = 0;
    async read(p: Uint8Array){
        if(this.counter < 10){
            p[0] = this.counter += 1;
            await new Promise((r)=> setTimeout(r, 1000));
            return 1;
        }else{
            return Deno.EOF;
        }
    }
}