const createGuid = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
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


class IDB {

    static exists(dbname) {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(dbname);
            var existed = true;
            req.onsuccess = function () {
                req.result.close();
                if (!existed) { indexedDB.deleteDatabase(dbname); }
                resolve(true);
            }
            req.onupgradeneeded = function () {
                resolve(false);
            }
            req.onerror = function(e) {
                reject(e);
            }
        });
    }

    constructor(name, dbScheme, version) {
        this.name = name;
        this.dbScheme = dbScheme;
        this.version = version;
        this.connected = false;
        this.connection = null;
        this.stores = {};
    }

    // create connection to database (if database not exist then create it)
    connect = async () => {
        console.log(this);
        // init all store which used in this database
        const dbPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(this.name, this.version);
            // create or update the database
            request.onupgradeneeded = async (e) => {
                const { result, transaction } = e.target;
                this.connection = result;
                const storeSchemes = Object.entries(this.dbScheme);
                for (let [name, storeScheme] of storeSchemes) {
                    await this.loadStore(name).createStore(storeScheme);
                }
                transaction.onerror = reject;
                transaction.oncomplete = () => { resolve(result); }
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
        const storeNames = Object.keys(this.dbScheme);
        storeNames.forEach(name => this.loadStore(name));
    }

    hasStore = (storeName) => {
        return new Promise((resolve) => {
            resolve(Array.from(this.connection.objectStoreNames).some(x => x === storeName));
        });
    }

    // load a store instance or create new one (helper function)
    loadStore = (name) => {
        if (!this.stores[name]) { this.stores[name] = new IDBStore(this, name); }
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
        return this;
    }
}

class IDBStore {
    // get key range based on filter
    static getKeyRange = (filter) => {
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
  
    // assign the connection, getStore helper and store scheme to instance
    constructor(db, name) {
        if (db) {
            this.getStore = db.loadStore;
            this.scheme = db.dbScheme[name];
            this.db = db;
        }
        this.name = name;
    }

    // get create promise for getting the related stores and assign to original item property
    getRelationshipPromise = async (item, promiseList, relationType, depth = 0) => {
        const relation = this.scheme.__relationships;
        if (!relation || !relation[relationType]) return;
        const entries = Object.entries(relation[relationType]);
        for (let [alias, relatedEntityData] of entries) {
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

    // get the __relationships and assign to original object, if no relationship then return the original item
    getItemWithRelations = async (itemPromise, depth) => {
        const result = await itemPromise;
        const relation = this.scheme.__relationships;
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
        if (promiseList.length) { await Promise.all(promiseList); }
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
        const keyRange = IDBStore.getKeyRange(filter);
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
    
    // add a new record to database (if have autoincrement column then it will add that too)
    addMultiple = (dataArray, key) => new Promise((resolve, reject) => {
        const [transaction, store] = this.openTransaction('readwrite');
        dataArray.forEach(data => {
            if (key) { 
                store.add(data, { keyPath: key }); 
            } else { 
                store.add(data); 
            }
        });    
        transaction.oncomplete = function(event) { resolve(); }
        transaction.onsuccess = function(event) { resolve(); }
        transaction.onerror = function(event) { reject(); }
    });

    // update an existing record or create a new one if the record not existed yet
    update = (data) => new Promise((resolve, reject) => {
        const [transaction, store] = this.openTransaction('readwrite');
        const request = store.put(data);
        transaction.onsuccess = function(e) { resolve(e.target.result); };
        transaction.oncomplete = function(e) { resolve(request.result); };
        request.onerror = reject;
    });    

    // delete a record from database based on keypath/primary key value
    delete = (id) => new Promise((resolve, reject) => {
        const [transaction, store] = this.openTransaction('readwrite');
        const request = store.delete(id);
        transaction.oncomplete = function(e) { resolve(true); };
        request.onerror = reject;
    });

    // create a new store (based on config/storeScheme)
    createStore = async (storeScheme = {}) => {
        // 1 primary key column is required
        let store = null;
        let columns = [];
        Object.entries(storeScheme).forEach(([columnName, columnData]) => {
            if (!columnData) { return; }
            const storeOption = {};
            if (columnData.primaryKey) {
                storeOption.keyPath = columnName;
                if (columnData.autoIncrement) storeOption.autoIncrement = true;
                store = this.db.connection.createObjectStore(this.name, storeOption);
            }

            if (columnData.index) {
                const indexOption = {};
                if (columnData.unique !== undefined) indexOption.unique = columnData.unique;
                if (columnData.multiEntry !== undefined) indexOption.multiEntry = columnData.multiEntry;
                if (columnData.locale !== undefined) indexOption.locale = columnData.locale;
                columns.push([columnName, columnName, indexOption]);
            };
        });
        columns.forEach(col => store.createIndex(...col));        
        return this;
    }

    // destroy the store
    dropStore = async () => {
        this.db.connection.deleteObjectStore(this.name);
        return this;
    }

    // clear the store content (wipe all data)
    truncateStore = async () => {
        const [transaction, store] = this.openTransaction('readwrite');
        store.clear();
        return this;
    }

    // get store and transaction helper, used nearly for every action except for drop
    openTransaction = (type) => {
        const transaction = this.db.connection.transaction([this.name], type);
        const store = transaction.objectStore(this.name);
        return [transaction, store];
    }
}

self.onmessage = function(event) {
    switch (event.data) {
      case "init":
            console.log('internal init');
            self.postMessage("init response: ");
        break;
  
      case "readAll":
            console.log('internal readAll');
            self.postMessage("readAll response: ");
        break;
  
      case "add":
            console.log('internal add');
            self.postMessage("add response: ");
            break;
    }
  };