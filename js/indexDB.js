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
            request.onupgradeneeded = (e) => {
                const { result, transaction } = e.target;
                db = result;
                this.connection = result;
                dbScheme.forEach(store => {
                    this.loadStore(store.name).createStore(store.columns);
                });
                transaction.onerror = reject;
                transaction.oncomplete = () => {
                    resolve(result);
                }
            };

            // if database exist then return the connection
            request.onsuccess = (e) => {
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
        if (!this.stores[name]) {
            this.stores[name] = new IndexDBStore(this, name);
        }
        return this.stores[name];
    }

    // destroy the database
    dropDatabase = () => {
        return new Promise((resolve, reject) => {
            const request = window.indexedDB.deleteDatabase(this.name);
            request.onerror = reject;
            request.onsuccess = resolve;
        });
    }

    // destory the database connection (stores will be useless without connection)
    disconnect = () => {
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
    getRelationshipPromise = (item, promiseList, relationType, depth = 0) => {
        const relation = this.config.relationships;
        if (!relation || !relation[relationType]) return;
        const getMethod = relationType === 'hasMany' ? 'get' : 'findFirst';
        Object.entries(relation[relationType])
            .forEach(([alias, data]) => {
                const [targetStore, targetColumn] = data.target.split('.');
                const relatedStore = this.getStore(targetStore);
                const relPromise = relatedStore[getMethod](targetItem => targetItem[targetColumn] === item[data.source]);
                promiseList.push(relPromise);
                relPromise.then(resultItem => {
                    if (depth > 0) {
                        relatedStore.getItemWithRelattions(Promise.resolve(resultItem), depth).then(x => item[alias] = x);
                    } else {
                        item[alias] = resultItem;
                    }
                });
            });
        return item;
    }

    // get the relationships and assign to original object, if no relationship then return the original item
    getItemWithRelattions = async (itemPromise, depth) => {
        const result = await itemPromise;
        const relation = this.config.relationships;
            if (!relation) return result;
        const isArray = Array.isArray(result);
        const items = isArray ? result : [result];
        const promiseList = [];

        for (const item of items) {
            this.getRelationshipPromise(item, promiseList, 'hasOne', depth - 1);
            this.getRelationshipPromise(item, promiseList, 'hasMany', depth - 1);
        }

        if (promiseList.length)
            await Promise.all(promiseList);
        return isArray ? items : items[0];
    }

    // get the multiple (array) records with relations,
    getJoin = (filter, depth = 0) => {
        return depth > 0 ? this.getItemWithRelattions(this.get(filter), depth) : this.get(filter);
    }

    // get a single record (object) with relations
    findFirstJoin = (filter, depth = 0) => {
        return depth > 0 ? this.getItemWithRelattions(this.findFirst(filter), depth - 1) : this.findFirst(filter);
    }

    // get the multiple (array) records, filter is will get the records 1 by 1 (with indexDB cursor)
    get = (filter) => {
        return new Promise((resolve, reject) => {
            const [transaction, store] = this.openTransaction('readonly')
            const keyRange = IDBKeyRange.lowerBound(0);
            const cursorRequest = store.openCursor(keyRange);
            const data = [];
            cursorRequest.onsuccess = (e) => {
                const result = e.target.result;
                if (result) {
                    if (!filter || filter(result.value))
                        data.push(result.value);
                    result.continue();
                } else {
                    resolve(data);
                }
            };
            transaction.onerror = reject;
            cursorRequest.onerror = reject;
        });
    }

    // get the single record (object) records, filter is will get the records 1 by 1 (with indexDB cursor)
    findFirst = (filter) => {
        return new Promise((resolve, reject) => {
            const [transaction, store] = this.openTransaction('readonly')
            const keyRange = IDBKeyRange.lowerBound(0);
            const cursorRequest = store.openCursor(keyRange);
            cursorRequest.onsuccess = (e) => {
                const result = e.target.result;
                if (result) {
                    if (!filter || filter(result.value))
                        resolve(result.value);
                    result.continue();
                } else {
                    resolve(null);
                }
            };
            transaction.onerror = reject;
            cursorRequest.onerror = reject;
        });
    }

    // add a new record to database (if have autoincrement column then it will add that too)
    add = (data, key) => {
        return new Promise((resolve, reject) => {
            const [transaction, store] = this.openTransaction('readwrite');
            const request = key ? store.add(data, { keyPath: key }) : store.add(data);

            transaction.onsuccess = function(e) {
                resolve(e.target.result);
            };

            transaction.oncomplete = function(e) {
                resolve(request.result);
            };
            request.onerror = reject;
        });
    }

    // update an existing record or create a new one if the record not existed yet
    update = (data) => {
        return new Promise((resolve, reject) => {
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
    }

    // delete a record from database based on keypath/primary key value
    delete = (id) => {
        return new Promise((resolve, reject) => {
            const [transaction, store] = this.openTransaction('readwrite');
            const request = store.delete(id);
            transaction.oncomplete = function(e) {
                resolve(true);
            };
            request.onerror = reject;
        });
    }

    // create a new store (based on config/storeScheme)
    createStore = (columns = []) => {
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
    dropStore = () => {
        this.db.deleteObjectStore(this.name);
    }

    // clear the store content (wipe all data)
    truncateStore = () => {
        const [transaction, store] = this.openTransaction('readwrite');
        store.clear();
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
        if (this.DBs[dbName] && this.DBs[dbName].connected)
            return;
        const database = new IndexDBDatabase(dbName);
        const dbConfig = this.config[dbName] || {};
        const version = this.getVersion(dbScheme, this.config[dbName]);
        database.version = version;
        database.dbScheme = dbScheme;
        // atm i delete old database if we have different version
        if (dbConfig.version !== version)
            database.dropDatabase();
        dbConfig.version = version;
        dbConfig.dbScheme = dbScheme;
        this.updateDbConfig(database);
        this.saveDbConfig();
        await database.connect(version, dbScheme);
        this.DBs[dbName] = database;
    }

    // wrapper for drop database, also update the settings in localStorage
    drop(dbName) {
        const db = new IndexDBDatabase(dbName);
        db.dropDatabase();
        delete this.DBs[dbName];
        delete this.config[dbName];
        this.saveDbConfig();
    }

    // disconnect from database wrapper
    disconnect(dbName) {
        this.DBs[dbName].disconnect();
        delete this.DBs[dbName];
    }

    // get a store from the created store list, from any database (helper)
    store(storeName) {
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
    updateDbConfig(db) {
        if (!this.config[db.name]) this.config[db.name] = {};
        const dbConfig = this.config[db.name];
        dbConfig.version = db.version;
        dbConfig.dbScheme = db.dbScheme;

        this.saveDbConfig();
    }

    // compare the old database scheme with new one and if different than increase the version by 1
    getVersion(newScheme, oldConfig) {
        if (!oldConfig || !oldConfig.dbScheme)
            return 1;
        return oldConfig.version + +(Boolean(JSON.stringify(newScheme) !== JSON.stringify(oldConfig.dbScheme)));
    }
}
