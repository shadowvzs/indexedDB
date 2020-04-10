const dbScheme = [
    {
        name: 'table1',
        columns: [
            {
                name: 'id',
                primaryKey: true,
                autoIncrement: true,
            },
            {
                name: 'name',
                index: true,
                unique: false
            },
            {
                name: 'title',
                index: true,
                unique: true
            },
        ],
    }
];

const myIndexDb = new IndexDB();
// wait till connect to database (db name, db scheme)
await myIndexDb.connect('valami2', dbScheme);
// get table/entity
const table = myIndexDb.table('table1');
// add a new record
table.add({ id: 2, kkk: "sss" });

class IndexDBDatabase {

    constructor(name) {
        this.name = name;
        this.dbScheme = null;
        this.version = null;
        this.connection = null;
        this.tables = {};
    }

    async connect(version, dbScheme) {
        this.dbScheme = dbScheme;
        this.version = version;
        // init all table which used in this database
        const dbPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(this.name, version);

            // Run migrations if necessary
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                this.connection = db;
                e.target.transaction.onerror = reject;
                dbScheme.forEach(table => {
                    this.loadTable(table).createTable(table.columns);
                });
                resolve(this.connection);
            };

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
        dbScheme.forEach(table => this.loadTable);
    }

    loadTable({ name }) {
        if (!this.tables[name])
            this.tables[name] = new IndexDBTable(this.connection, name);
        return this.tables[name];
    }

    dropDatabase() {
        return new Promise((resolve, reject) => {
            const request = window.indexedDB.deleteDatabase(this.name);
            request.onerror = reject;
            request.onsuccess = resolve;
        });
    }

    disconnect() {
        this.connection.close();
    }
}

class IndexDBTable {

    constructor(database, name) {
        this.db = database;
        this.name = name;
    }

    get(filter) {
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

    add(data) {
        return new Promise((resolve, reject) => {
            const [transaction, store] = this.openTransaction('readwrite');
            const request = store.add(data);
            // vagy onsuccess
            transaction.oncomplete = function(e) {
                resolve(data);
            };
            request.onerror = reject;
        });
    }

    update(data) {
        return new Promise((resolve, reject) => {
            const [transaction, store] = this.openTransaction('readwrite');
            const request = store.put(data);result
            transaction.oncomplete = function(e) {
                resolve(data);
            };
            request.onerror = reject;
        });
    }

    delete(id, callback) {
        return new Promise((resolve, reject) => {
            const [transaction, store] = this.openTransaction('readwrite');
            const request = store.delete(id);
            transaction.oncomplete = function(e) {
                resolve(true);
            };
            request.onerror = reject;
        });
    }

    createTable(columns = []) {
        // 1 primary key column is required
        const primaryColumn = columns.find(column => column.primaryKey);
        const storeOption = {};
        if (primaryColumn.primaryKey) storeOption.keyPath = primaryColumn.name;
        if (primaryColumn.autoIncrement) storeOption.autoIncrement = true;
        const store = this.db.createObjectStore(this.name, storeOption);

        columns.filter(column => column.index).forEach(column => {
            const indexOption = {
                unique: !!column.unique,
                multiEntry: !!column.multiEntry,
                locale: column
            };
            store.createIndex(column.name, column.name, indexOption);
        });
    }

    dropTable() {
        this.db.deleteObjectStore(this.name);
    }

    truncateTable() {
        const [transaction, store] = this.openTransaction('readwrite');
        store.clear();
    }


    openTransaction(type) {
        const transaction = this.db.transaction([this.name], type);
        const store = transaction.objectStore(this.name);
        return [transaction, store];
    }
}

class IndexDB {

    constructor() {
        // this.database = new IndexDBDatabase(dbName);
        this.config = this.loadDbConfig();
        this.DBs = {};
        // this.dbName = dbName;
        // this.dbScheme = dbScheme;
        // this.version = this.getVersion();
        // this.updateDbConfig();
        // this.database.version = this.version;
    }

    async connect(dbName, dbScheme) {
        const database = new IndexDBDatabase(dbName);
        const dbConfig = this.config[dbName] || {};
        const version = this.getVersion(dbScheme, this.config[dbName]);
        // atm i delete old database if we have different version
        if (dbConfig.version !== version)
            database.dropDatabase();
        dbConfig.version = version;
        dbConfig.dbScheme = dbScheme;
        this.saveDbConfig();
        await database.connect(version, dbScheme);
        this.DBs[dbName] = database;
    }

    disconnect(dbName) {
        this.DBs[dbName].disconnect();
    }

    table(tableName) {
        const dbList = Object.entries(this.DBs);
        for (const [name, obj] of dbList) {
            const table = obj.tables[tableName];
            if (table) return table;
        }
        return;
    }

    loadDbConfig() {
        try {
            return JSON.parse(localStorage.getItem('IDBConfig')) || {};
        } catch (err) {
            return {};
        }
    }

    saveDbConfig() {
        localStorage.setItem('IDBConfig', JSON.stringify(this.config));
    }

    updateDbConfig() {
        this.saveDbConfig({
            ...this.config,
            [this.dbName]: {
                version: this.version,
                dbScheme: this.dbScheme
            }
        })
    }

    getVersion(newScheme, oldConfig) {
        if (!oldConfig || !oldConfig.dbScheme)
            return 1;
        return oldConfig.version + +(Boolean(JSON.stringify(newScheme) !== JSON.stringify(oldConfig.dbScheme)));
    }
}

(function() {
/*
  // Some global variables (database, references to key UI elements)
  var db, input, ul;

  databaseOpen(function() {
    input = document.querySelector('input');
    ul = document.querySelector('ul');
    document.body.addEventListener('submit', onSubmit);
    document.body.addEventListener('click', onClick);
    databaseTodosGet(renderAllTodos);
  });

  function onClick(e) {

    // We'll assume any element with an ID attribute
    // is a todo item. Don't try this at home!
    if (e.target.hasAttribute('id')) {

      // Note because the id is stored in the DOM, it becomes
      // a string so need to make it an integer again
      databaseTodosDelete(parseInt(e.target.getAttribute('id'), 10), function() {
        databaseTodosGet(renderAllTodos);
      });
    }
  }

  function renderAllTodos(todos) {
    var html = '';
    todos.forEach(function(todo) {
      html += todoToHtml(todo);
    });
    ul.innerHTML = html;
  }

  function todoToHtml(todo) {
    return '<li id="'+todo.timeStamp+'">'+todo.text+'</li>';
  }

  function onSubmit(e) {
    e.preventDefault();
    databaseTodosAdd(input.value, function() {
    // After new todos have been added - rerender all the todos
    databaseTodosGet(renderAllTodos);
      input.value = '';
    });
  }

  function databaseOpen(callback) {
    // Open a database, specify the name and version
    var version = 1;
    var request = indexedDB.open('todos', version);

    // Run migrations if necessary
    request.onupgradeneeded = function(e) {
      db = e.target.result;
      e.target.transaction.onerror = databaseError;
      db.createObjectStore('todo', { keyPath: 'timeStamp' });
    };

    request.onsuccess = function(e) {
      db = e.target.result;
      callback();
    };
    request.onerror = databaseError;
  }

  function databaseError(e) {
    console.error('An IndexedDB Error has occurred', e);
  }

  function databaseTodosAdd(text, callback) {
    var transaction = db.transaction(['todo'], 'readwrite');
    var store = transaction.objectStore('todo');
    var request = store.put({
      text: text,
      timeStamp: Date.now()
    });

    transaction.oncomplete = function(e) {
      callback();
    };
    request.onerror = databaseError;
  }

  function databaseTodosGet(callback) {
    var transaction = db.transaction(['todo'], 'readonly');
    var store = transaction.objectStore('todo');

    // Get everything in the store
    var keyRange = IDBKeyRange.lowerBound(0);
    var cursorRequest = store.openCursor(keyRange);

    // This fires once per row in the store, so for simplicity
    // collect the data in an array (data) and send it pass it
    // in the callback in one go
    var data = [];
    cursorRequest.onsuccess = function(e) {
      var result = e.target.result;

      // If there's data, add it to array
      if (result) {
        data.push(result.value);
        result.continue();

      // Reach the end of the data
      } else {
        callback(data);
      }
    };
  }

  function databaseTodosDelete(id, callback) {
    var transaction = db.transaction(['todo'], 'readwrite');
    var store = transaction.objectStore('todo');
    var request = store.delete(id);
    transaction.oncomplete = function(e) {
      callback();
    };
    request.onerror = databaseError;
  }
*/
}());
