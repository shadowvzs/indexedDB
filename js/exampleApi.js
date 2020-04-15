{
    const container = document.getElementById("root");
    const itemText = container.querySelector('input[name="recordText"]')
    const columnList = container.querySelector('.columnList')

    // assign event to form submit
    container.querySelectorAll('form').forEach(form => {
        form.onsubmit = (event) => {
            const form = event.target;
            const data = extractDataFromForm(form);
            const actionName = form.dataset.action;
            const dataArray = Object.values(data);
            actions[actionName](dataArray.length === 1 ? dataArray[0]: data);
            event.preventDefault();
            return false;
        }
    });

    // cache the ul list into this object
    const listContainers = {};
    container.querySelectorAll('ul[data-list]').forEach(ul => {
        listContainers[ul.dataset.list] = ul;
        ul.onclick = (event) => {
            const { action, param } = event.target.dataset;
            if (action)
                actions[action](param);
        }
    });

    // extract data from form elements and return that dictionary object
    const extractDataFromForm = (form) => {
        const data = {};
        form.querySelectorAll('select, input, textarea').forEach(formElem => {
            data[formElem.name] = formElem.value;
            formElem.value = '';
        });
        return data;
    };

    // init our indexDB
    const myIndexDb = new IndexDB();
    let selectedDb = null;
    let selectedStore = null;
    let selectedRecord = null;

    const getStore = () => {
        if (!selectedDb || !selectedStore || !myIndexDb.DBs[selectedDb].stores)
            return;
        return myIndexDb.DBs[selectedDb].loadStore(selectedStore);
    }

    // all action what we use in view, in this action we use the data from forms and pass to indexDb
    const actions = {
        connectToDb: async (dbName) => {
            await myIndexDb.connect(dbName, [
                getDummyStoreScheme('profiles'),
                getDummyStoreScheme('users'),
                getDummyStoreScheme('comments'),
            ]);
            selectedDb = dbName;
            actions.listDatabases();
            const firstStore = Object.keys(myIndexDb.DBs[dbName].stores)[0];
            actions.selectStore(firstStore);
        },
        createDummyData: async () => {
            if (!selectedDb)
                return alert('connect to an database');
            await createDummyRecord(myIndexDb.DBs[selectedDb]);
            actions.listRecords();
        },
        selectStore: async (storeName) => {
            selectedStore = storeName;
            selectedRecord = null;
            actions.listStores()
            actions.listRecords();
        },
        selectRecord: async (id) => {
            const store = getStore();
            if (!store) return console.error('No selected store');
            const item = await store.findFirst(x => x.id === +id);
            if (!item) return console.error('No selected item');
            itemText.value = JSON.stringify(item);
            selectedRecord = item.id;
        },
        createRecord: async (recordData) => {
            const store = getStore();
            if (!store)
                return console.error('No selected store');
            const data = JSON.parse(recordData);
            if (!selectedRecord) {
                await store.add(data);
            } else {
                await store.update(data);
                selectedRecord = null;
            }
            actions.listRecords();
        },
        deleteRecord: async (id) => {
            const store = getStore();
            if (!store)
                return console.error('No selected store');
            if (selectedRecord === +id)
                selectedRecord = null;
            await store.delete(+id);
            actions.listRecords();
        },
        listDatabases: () => {
            const connectedDbNames = Object.keys(myIndexDb.DBs);
            const registeredDbNames = Object.keys(myIndexDb.config);
            const dbNames = new Set([...connectedDbNames, ...registeredDbNames]);
            let list = ``;
            dbNames.forEach(name => {
                const classNames = [];
                let isOn = connectedDbNames.indexOf(name) >= 0;
                if (name === selectedDb) classNames.push('active');
                if (isOn)
                    classNames.push('connected');
                list += `<li class="${classNames.join(' ')}">
                    <a>${name}</a>
                    <div>
                        ${isOn ? `<a data-action="dbDisconnect" data-param="${name}" title="Disconnect '${name}' database"> [Off] </a>` : ''}
                        ${!isOn ? `<a data-action="connectToDb" data-param="${name}" title="Connect '${name}' database"> [On] </a>` : ''}
                        <a data-action="dropDatabase" data-param="${name}" title="Delete '${name}' database"> [X] </a>
                    </div>
                </li>`;
            });
            listContainers['databases'].innerHTML = list;
        },
        listStores: async () => {
            if (!selectedDb || !selectedStore || !myIndexDb.DBs[selectedDb].stores)
                return listContainers['stores'].innerHTML = '';
            const db = myIndexDb.DBs[selectedDb];
            const stores = db.stores;
            if (selectedStore)
                columnList.innerHTML = db.dbScheme.find(x => x.name === selectedStore).columns.map(x => x.name).join(', ');
            const storeNames = Object.keys(stores);
            let list = ``;
            storeNames.forEach(name => {
                const classNames = [];
                if (name === selectedStore) classNames.push('active');
                list += `<li class="${classNames.join(' ')}">
                    <a data-action="selectStore" data-param="${name}" title="Select '${name}' store">${name}</a>
                    <a data-action="deleteStore" data-param="${name}" title="Delete '${name}' store"> [DEL] </a>
                </li>`;
            });
            listContainers['stores'].innerHTML = list;
        },
        listRecords: async () => {
            const store = getStore();
            if (!store)
                return listContainers['records'].innerHTML = '';
            const items = await store.getJoin(null, 2);
            let list = ``;
            items.forEach(item => {
                const classNames = ['item'];
                if (item.id === selectedRecord) classNames.push('active');
                list += `
                <li class="${classNames.join(' ')}">
                    ${Object.entries(item).map(([key, value])=> {
                        console.log(item);
                        if (typeof value === "object")
                            return `<div><b>${key}:</b> ${JSON.stringify(value)}</div>`;
                        return `<div><b>${key}:</b> ${value}</div>`;
                    }).join('')}
                    <div class="actions">
                        <a data-action="selectRecord" data-param="${item.id}" title="Edit '${item.id}' store"> [EDIT] </a>
                        <a data-action="deleteRecord" data-param="${item.id}" title="Delete '${item.id}' store"> [DELETE] </a>
                    </div>
                </li>`;
            });
            listContainers['records'].innerHTML = list;
        },
        dropDatabase: (dbName) => {
            if (selectedDb === dbName)
                selectedDb = null;
            myIndexDb.drop(dbName);
            actions.listDatabases();

        },
        dbDisconnect: (dbName) => {
            if (selectedDb === dbName) {
                selectedDb = null;
                selectedStore = null;
                selectedRecord = null;
                actions.listStores()
                actions.listRecords();
            }
            myIndexDb.disconnect(dbName);
            actions.listDatabases();
        }
    }

    actions.listDatabases();
    container.querySelector('button[data-action="createDummyData"]').onclick = actions.createDummyData;
};
