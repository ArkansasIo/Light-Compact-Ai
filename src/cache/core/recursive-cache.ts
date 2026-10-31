export type CacheDimension = string | number;
export type CachePath = readonly CacheDimension[];
export interface CacheOptions { sizeBytes?: number; ttlMs?: number; version?: string; tags?: readonly string[]; }
export interface CacheStats { entries:number; bytes:number; hits:number; misses:number; evictions:number; }
interface Entry<T>{value:T;size:number;expiresAt:number;lastUsed:number;version:string;tags:Set<string>}
interface Node<T>{children:Map<CacheDimension,Node<T>>;entry?:Entry<T>}
const makeNode=<T>():Node<T>=>({children:new Map()});
const keyOf=(path:CachePath)=>JSON.stringify(path);
function validate(path:CachePath):void{if(!path.length||path.some(x=>(typeof x!=="string"&&typeof x!=="number")||(typeof x==="string"&&!x)||(typeof x==="number"&&!Number.isFinite(x))))throw new Error("Cache path must contain valid dimensions.");}
/** Recursive, arbitrary-depth cache tree with global byte/entry budgets, TTL and LRU eviction. */
export class RecursiveCache<T=unknown>{
 private root=makeNode<T>(); private index=new Map<string,{path:CachePath;entry:Entry<T>}>(); private bytes=0; private hits=0; private misses=0; private evictions=0;
 constructor(readonly maxBytes=256*1024*1024,readonly maxEntries=100000,readonly defaultTtlMs=0){if(!Number.isFinite(maxBytes)||maxBytes<1||!Number.isInteger(maxEntries)||maxEntries<1||defaultTtlMs<0)throw new Error("Invalid cache limits.");}
 private find(path:CachePath,create=false):Node<T>|undefined{let current=this.root;for(const dimension of path){let child=current.children.get(dimension);if(!child&&create){child=makeNode<T>();current.children.set(dimension,child);}if(!child)return undefined;current=child;}return current;}
 private remove(path:CachePath):boolean{const key=keyOf(path),record=this.index.get(key);if(!record)return false;const target=this.find(path);if(target)delete target.entry;this.index.delete(key);this.bytes-=record.entry.size;return true;}
 private expire():void{const now=Date.now();for(const record of [...this.index.values()])if(record.entry.expiresAt>0&&record.entry.expiresAt<=now){this.remove(record.path);this.evictions++;}}
 set(path:CachePath,value:T,options:CacheOptions={}):void{validate(path);const size=options.sizeBytes??0,ttl=options.ttlMs??this.defaultTtlMs;if(!Number.isFinite(size)||size<0||!Number.isFinite(ttl)||ttl<0)throw new Error("Invalid cache entry policy.");if(size>this.maxBytes)return;this.expire();this.remove(path);const entry:Entry<T>={value,size,expiresAt:ttl?Date.now()+ttl:0,lastUsed:Date.now(),version:options.version??"1",tags:new Set(options.tags??[])};this.find(path,true)!.entry=entry;this.index.set(keyOf(path),{path:[...path],entry});this.bytes+=size;this.enforceLimits();}
 get(path:CachePath,version?:string):T|undefined{validate(path);this.expire();const entry=this.find(path)?.entry;if(!entry||(version!==undefined&&entry.version!==version)){this.misses++;return undefined;}entry.lastUsed=Date.now();this.hits++;return entry.value;}
 delete(path:CachePath):boolean{validate(path);return this.remove(path);}
 invalidatePrefix(prefix:CachePath):number{validate(prefix);let count=0;for(const record of [...this.index.values()])if(prefix.every((d,i)=>record.path[i]===d)&&this.remove(record.path))count++;return count;}
 invalidateTag(tag:string):number{let count=0;for(const record of [...this.index.values()])if(record.entry.tags.has(tag)&&this.remove(record.path))count++;return count;}
 private enforceLimits():void{while(this.bytes>this.maxBytes||this.index.size>this.maxEntries){let oldest:{path:CachePath;entry:Entry<T>}|undefined;for(const record of this.index.values())if(!oldest||record.entry.lastUsed<oldest.entry.lastUsed)oldest=record;if(!oldest)break;this.remove(oldest.path);this.evictions++;}}
 clear():void{this.root=makeNode<T>();this.index.clear();this.bytes=0;}
 stats():CacheStats{this.expire();return{entries:this.index.size,bytes:this.bytes,hits:this.hits,misses:this.misses,evictions:this.evictions};}
 paths():CachePath[]{return[...this.index.values()].map(record=>[...record.path]);}
}
