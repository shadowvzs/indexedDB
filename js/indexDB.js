const createGuid = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

const getKeyRange = (filter) => {
    if (Array.isArray(filter)) {
        const [v1, v2] = filter;
        if (v1 && v2) {
            return IDBKeyRange.bound(v1, v2, false, false);
        } else if (v1) {
            return upperBound.lowerBound(v1);
        } else if (v2) {
            return IDBKeyRange.lowerBound(v2);
        }
    } else if (filter && typeof filter !== 'function') {
        return IDBKeyRange.only(filter);
    }
    return IDBKeyRange.lowerBound(0);
}

// IDBKeyRange cheatsheet
/*
    All keys ≥ x 	        IDBKeyRange.lowerBound(x)
    All keys > x 	        IDBKeyRange.lowerBound(x, true)
    All keys ≤ y 	        IDBKeyRange.upperBound(y)
    All keys < y          	IDBKeyRange.upperBound(y, true)
    All keys ≥ x && ≤ y 	IDBKeyRange.bound(x, y)
    All keys > x &&< y 	    IDBKeyRange.bound(x, y, true, true)
    All keys > x && ≤ y 	IDBKeyRange.bound(x, y, true, false)
    All keys ≥ x &&< y 	    IDBKeyRange.bound(x, y, false, true)
    The key = z 	        IDBKeyRange.only(z)
*/


class IndexDBDatabase {

    constructor(name) {
        this.name = name;
        this.dbScheme = null;
        this.version = null;
        this.connected = false;
        this.connection = null;
        this.stores = {};
    }

    // create connection to database (if database not exist then create it)
    connect = async (version, dbScheme) => {
        this.dbScheme = dbScheme;
        this.version = version;
        // init all store which used in this database
        const dbPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(this.name, version);
            // create or update the database
            request.onupgradeneeded = async (e) => {
                const { result, transaction } = e.target;
                const db = result;
                this.connection = result;
                for (let item of dbScheme) {
                    await this.loadStore(item.name).createStore(item.columns);
                }
                transaction.onerror = reject;
                transaction.oncomplete = () => {
                    resolve(result);
                }
            };

            // if database exist then return the connection
            request.onsuccess = async (e) => {
                const db = e.target.result;
                db.onversionchange = () => {
                    db.close();
                    alert("Database is outdated, please reload the page.")
                };
                resolve(db);
            }
            request.onerror = reject;
        });

        this.connection = await dbPromise;
        this.connected = true;
        dbScheme.forEach(store => this.loadStore(store.name));
    }

    // load a store instance or create new one (helper function)
    loadStore = (name) => {
        if (!this.stores[name]) { this.stores[name] = new IndexDBStore(this, name); }
        return this.stores[name];

    };

    // destroy the database
    dropDatabase = () => new Promise((resolve, reject) => {
        const request = window.indexedDB.deleteDatabase(this.name);
        request.onerror = reject;
        request.onsuccess = resolve;
    });

    // destory the database connection (stores will be useless without connection)
    disconnect = async () => {
        this.connected = false;
        this.connection.close();
    }
}

class IndexDBStore {

    // assign the connection, getStore helper and store scheme to instance
    constructor(indexDBDatabase, name) {
        if (indexDBDatabase) {
            this.getStore = indexDBDatabase.loadStore;
            this.config = indexDBDatabase.dbScheme.find(x => x.name === name);
            this.db = indexDBDatabase.connection;
        }
        this.name = name;
    }

    // get create promise for getting the related stores and assign to original item property
    getRelationshipPromise = async (item, promiseList, relationType, depth = 0) => {
        const relation = this.config.relationships;
        if (!relation || !relation[relationType]) return;
        const entries = Object.entries(relation[relationType]);
        for (let [alias, relatedEntityData] of entries) {
            console.log(alias, relatedEntityData)
            const [relatedEntityName, relatedEntityColumn] = relatedEntityData.target.split('.');
            const relatedStore = await this.getStore(relatedEntityName);
            const relPromise = relatedStore.get(
                targetItem => targetItem[relatedEntityColumn] === item[relatedEntityData.source], 
                relationType === 'hasMany' ? -1 : 1
            );
            promiseList.push(relPromise);
            const resultItem = await relPromise;
            if (depth > 0) {
                await relatedStore.getItemWithRelations(Promise.resolve(resultItem), depth).then(x => item[alias] = x);
            } else {
                item[alias] = resultItem;
            }
                        
        }
        return item;
    }

    // get the relationships and assign to original object, if no relationship then return the original item
    getItemWithRelations = async (itemPromise, depth) => {
        const result = await itemPromise;
        const relation = this.config.relationships;
            if (!relation) return result;
        const isArray = Array.isArray(result);
        const items = isArray ? result : [result];
        const promiseList = [];

        for (const item of items) {
            await Promise.all([
                await this.getRelationshipPromise(item, promiseList, 'hasOne', depth - 1),
                await this.getRelationshipPromise(item, promiseList, 'hasMany', depth - 1)
            ]);
        }

        if (promiseList.length) {
            await Promise.all(promiseList);
        }
        return isArray ? items : items[0];
    }

    // get the multiple (array) records with relations,
    getRelatedEntities = (filter, depth = 1, limit = -1) => {
        const promise = this.get(filter, limit);
        return depth > 0 ? this.getItemWithRelations(promise, depth) : promise;
    }

    // get a single record (object) with relations
    getFirstJoin = (filter, depth = 0) => this.getRelatedEntities(filter, depth, 1);

    // get the multiple (array) records, filter is will get the records 1 by 1 (with indexDB cursor)
    get = (filter, limit = -1) => new Promise((resolve, reject) => {
        const [transaction, store] = this.openTransaction('readonly')
        const keyRange = getKeyRange(filter);
        const cursorRequest = store.openCursor(keyRange);
        const data = [];
        const filterFn = (filter && typeof filter === 'function') ? filter : () => true;
        let i = 0;
        cursorRequest.onsuccess = (e) => {
            const result = e.target.result;
            if (result) {
                if (filterFn(result.value)) { 
                    data.push(result.value); 
                    i++;
                }
                if (limit === 1 && i === 1) { resolve(result.value); }
                if (i === limit) { resolve(data); }
                result.continue();
            } else {
                resolve(data);
            }
        };
        transaction.onerror = reject;
        cursorRequest.onerror = reject;
    });

    getBetween = (start, end, limit = -1) => this.get([start, end], limit);
    getFirst = (filter) => this.get(filter, 1);

    // add a new record to database (if have autoincrement column then it will add that too)
    add = (data, key) => new Promise((resolve, reject) => {
        const [transaction, store] = this.openTransaction('readwrite');
        const request = key ? store.add(data, { keyPath: key }) : store.add(data);
        transaction.onsuccess = function(e) { resolve(e.target.result); };
        transaction.oncomplete = function(e) { resolve(request.result); };
        request.onerror = reject;
    });

    // update an existing record or create a new one if the record not existed yet
    update = (data) => new Promise((resolve, reject) => {
        const [transaction, store] = this.openTransaction('readwrite');
        const request = store.put(data);
        transaction.onsuccess = function(e) {
            resolve(e.target.result);
        };
        transaction.oncomplete = function(e) {
            resolve(request.result);
        };
        request.onerror = reject;
    });
    

    // delete a record from database based on keypath/primary key value
    delete = (id) => new Promise((resolve, reject) => {
        const [transaction, store] = this.openTransaction('readwrite');
        const request = store.delete(id);
        transaction.oncomplete = function(e) {
            resolve(true);
        };
        request.onerror = reject;
    });

    // create a new store (based on config/storeScheme)
    createStore = async (columns = []) => {
        // 1 primary key column is required
        const primaryColumn = columns.find(column => column.primaryKey);
        const storeOption = {};
        if (primaryColumn.primaryKey) storeOption.keyPath = primaryColumn.name;
        if (primaryColumn.autoIncrement) storeOption.autoIncrement = true;
        const store = this.db.createObjectStore(this.name, storeOption);

        columns.filter(column => column.index).forEach(column => {
            const indexOption = {};
            if (column.unique !== undefined) indexOption.unique = column.unique;
            if (column.multiEntry !== undefined) indexOption.multiEntry = column.multiEntry;
            if (column.locale !== undefined) indexOption.locale = column.locale;
            store.createIndex(column.name, column.name, indexOption);
        });
    }

    // destroy the store
    dropStore = async () => {
        this.db.deleteObjectStore(this.name);
    }

    // clear the store content (wipe all data)
    truncateStore = async () => {
        this.openTransaction('readwrite')[1].clear();
    }

    // get store and transaction helper, used nearly for every action except for drop
    openTransaction = (type) => {
        const transaction = this.db.transaction([this.name], type);
        const store = transaction.objectStore(this.name);
        return [transaction, store];
    }
}

class IndexDB {

    constructor() {
        this.config = this.loadDbConfig();
        this.DBs = {};
    }

    // wrapper for connection, make database connection and register it, save it into localStorage
    async connect(dbName, dbScheme) {
        if (this.DBs[dbName] && this.DBs[dbName].connected) { return; }
        const database = new IndexDBDatabase(dbName);
        const dbConfig = this.config[dbName] || {};
        const version = await this.getVersion(dbScheme, this.config[dbName]);
        database.version = version;
        database.dbScheme = dbScheme;
        // atm i delete old database if we have different version
        if (dbConfig.version !== version) {
            await database.dropDatabase();
        }
        dbConfig.version = version;
        dbConfig.dbScheme = dbScheme;
        await this.updateDbConfig(database);
        this.saveDbConfig();
        await database.connect(version, dbScheme);
        this.DBs[dbName] = database;
    }

    // wrapper for drop database, also update the settings in localStorage
    async drop(dbName) {
        const db = new IndexDBDatabase(dbName);
        await db.dropDatabase();
        delete this.DBs[dbName];
        delete this.config[dbName];
        this.saveDbConfig();
    }

    // disconnect from database wrapper
    async disconnect(dbName) {
        await this.DBs[dbName].disconnect();
        delete this.DBs[dbName];
    }

    // get a store from the created store list, from any database (helper)
    async getStore(storeName) {
        const dbList = Object.entries(this.DBs);
        for (const [name, obj] of dbList) {
            const store = obj.stores[storeName];
            if (store) return store;
        }
        return;
    }

    // load and parse config from localStorage
    loadDbConfig() {
        try {
            return JSON.parse(localStorage.getItem('IDBConfig')) || {};
        } catch (err) {
            return {};
        }
    }

    // save config into localStorage
    saveDbConfig() {
        localStorage.setItem('IDBConfig', JSON.stringify(this.config));
    }

    // update config for a database and also update it in localStorage too
    async updateDbConfig(db) {
        if (!this.config[db.name]) this.config[db.name] = {};
        const dbConfig = this.config[db.name];
        dbConfig.version = db.version;
        dbConfig.dbScheme = db.dbScheme;

        this.saveDbConfig();
    }

    // compare the old database scheme with new one and if different than increase the version by 1
    async getVersion(newScheme, oldConfig) {
        if (!oldConfig || !oldConfig.dbScheme)
            return 1;
        return oldConfig.version + +(Boolean(JSON.stringify(newScheme) !== JSON.stringify(oldConfig.dbScheme)));
    }
}
