
export type SelectParams<T> = number | string | ((item: T) => boolean);
export function createGuid (): string;
export function getKeyRange<T>(filter: SelectParams<T>): IDBKeyRange;

interface RelationShipData {
    source: string;
    target: string;
}

interface RelationShips {
    hasOne?: Record<string, RelationShipData>;
    hasMany?: Record<string, RelationShipData>;
}

interface Column {
    autoIncrement?: boolean;
    name: string;
    index?: boolean;
    primaryKey?: boolean;
    unique?: boolean;
}

export interface DbScheme {
    name: string;
    columns: Column[];
    relationships?: RelationShips; 
}

export type Config = any;

export declare class IndexDBDatabase {
    public dbScheme: DbScheme;
    public version: number;
    public connected: boolean;
    public connection: IDBDatabase;
    public stores: Record<string, IndexDBStore>;
    constructor(public name: string);
    public connect(version: number, dbScheme: DbScheme): Promise<void>;
    public loadStore(name: string): Promise<IndexDBStore>;
    public dropDatabase(): Promise<void>;
    public disconnect(): Promise<void>;
}

export declare class IndexDBStore<T> {
    constructor(indexDBDatabase: IndexDBStore, public name: string);
    public getRelationshipPromise(item: T, promiseList: Promise<any>[], relationType: 'hasOne' | 'hasMany', depth?: number): T;
    public getItemWithRelattions(itemPromise: Promise<T | T[]>, depth: number): Promise<T | T[]> ;
    public getRelatedEntities(params: SelectParams, depth?: number, limit?: number): Promise<T | T[]>;
    public getFirstJoin(params: SelectParams, depth?: number): Promise<T | T[]>;
    public get(params: SelectParams, limit?: number): Promise<T | T[]>;
    public getBetween(start: string | number, end: string | number, limit?: number): Promise<T | T[]>;
    public getFirst (params: SelectParams): Promise<T | T[]>;
    public add(data: T, key: keyof T): Promise<number | string>;
    public update(data: T): Promise<number | string>;
    public delete(id): Promise<boolean>;
    public createStore(columns?: Column[]): Promise<void>;
    public dropStore(): Promise<void>;
    public truncateStore(): Promise<void>;
    // public openTransaction(type): [IndexDBDatabase, IndexDBStore];
}

export declare class IndexDB {
    public config: Config;
    public DBs: Record<String, IndexDBDatabase>;
    public connect(dbName: string, dbSchemes: DbScheme[]): Promise<void>;
    public drop(dbName: string): Promise<void>
    public disconnect(dbName: string): Promise<void>;
    public getStore(storeName): Promise<IndexDBStore>;
    public loadDbConfig(): Promise<Config>;
    public saveDbConfig(): Promise<void>;
    public updateDbConfig(db: IndexDBDatabase): Promise<void>;
    public getVersion(newScheme: DbScheme, oldScheme: Config): Promise<number>;
}
