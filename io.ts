type Reader = Deno.Reader;
/** Reader utility for combining multiple promises that resolve to readers */
export class PromiseMultiReader implements Reader {
    private readonly readers: Reader[];
    private readonly pending: Set<Promise<Reader>>;
    private currentIndex = 0;

    constructor(readers: (Reader | Promise<Reader>)[]) {
        this.readers = readers.filter((r) => !(r instanceof Promise)) as Reader[];
        this.pending = new Set(
            readers.filter((r) => r instanceof Promise) as Promise<Reader>[]
        );
        this.pending.forEach((p) => {
            p.then((v) => this.readers.push(v));
            p.finally(() => this.pending.delete(p));
        })
    }

    addReader(reader: Reader | Promise<Reader>){
        if(reader instanceof Promise){
            reader.then((v) => this.readers.push(v));
            reader.finally(() => this.pending.delete(reader));
            this.pending.add(reader);
            console.log("Added pending reader:", this.pending.size)
        }
    }

    async read(p: Uint8Array): Promise<number | Deno.EOF> {
        let r = this.readers[this.currentIndex];
        if(r){
            console.debug("Got a reader ...")
        }
        while(!r && this.pending.size > 0){
            console.debug("Waiting for promised readers: ", this.pending.size);
            await Promise.race(this.pending);
            r = this.readers[this.currentIndex];
            // @ts-ignore
            console.debug("reader:", r, r.rid)
        }
        if (!r) return Deno.EOF;
        if(r instanceof Promise){ // skip it
            this.currentIndex++;
        }
        const result = await r.read(p);
        if (result === Deno.EOF) {
            console.log("Reader ended ...")
            this.currentIndex++;
            return 0;
        }
        return result; 
    }
}