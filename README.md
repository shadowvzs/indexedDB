# indexedDB
IndexDB with promises

#### What is indexDB?
Who don't know what is it then please read this article: https://javascript.info/indexeddb

### What is this?
This small lib is an indexDb wrapper to make easier the works with it, we can use promises, can describe schema and relationships between stores and so on :)

Example for store schema:
<details>
  <summary>Click to expand!</summary>
  
  ```javascript
  const userStoreSchema = {
      name: 'users',
      columns: [
          {
              name: 'id',
              primaryKey: true,
              autoIncrement: true,
          },
          {
              name: 'username',
              index: true,
              unique: false
          },
          {
              name: 'profile_id',
              index: true
          },
          {
              name: 'date',
              index: true,
              unique: true
          }
      ],
      relationships: {
          hasOne: {
              profile: {
                  source: 'profile_id',
                  target: 'profiles.id'
              }
          },
          hasMany: {
              comments: {
                  source: 'id',
                  target: 'comments.user_id'
              }
          }
      }
  };

  const commentsStoreSchema = {
      name: 'comments',
      columns: [
          {
              name: 'id',
              primaryKey: true,
              autoIncrement: true,
          },
          {
              name: 'message',
              index: true,
              unique: false
          },
          {
              name: 'user_id',
              index: true
          },
          {
              name: 'date',
              index: true,
              unique: true
          }
      ]
  };

  const profilesStoreSchema = {
      name: 'profiles',
      columns: [
          {
              name: 'id',
              primaryKey: true,
              autoIncrement: true,
          },
          {
              name: 'displayName',
              index: true,
              unique: false
          },
          {
              name: 'user_id',
              index: true
          },
          {
              name: 'date',
              index: true,
              unique: true
          }
      ],
      relationships: {
          hasOne: {
              user: {
                  source: 'user_id',
                  target: 'users.id'
              }
          }
      }
  };
```
</details>

Example for store adding items:
<details>
  <summary>Click to expand!</summary>
  
```javascript

    const dbName = "my-db";
    const myIndexDb = new IndexDB();

    await myIndexDb.connect(dbName, [
        userStoreSchema,
        commentsStoreSchema,
        profilesStoreSchema
    ]);
    
    const db = myIndexDb.DBs[dbName];

    // add a new user and get its id
    const userId = await db.loadStore('users').add({
        username: dummyUserName[idx],
        date: dummyDate
    });
    
    // add a new profile for existing user
    const profileId = await db.loadStore('profiles').add({
        displayName: dummyDisplayName[idx],
        user_id: userId,
    });
    
    // add a new comment
    await db.loadStore('comments').add({
        message: dummyComment[commentId] + '#1',
        user_id: userId,
    });
    
    // update a record/object in users store
    await db.loadStore('users').update({
        id: userId,
        profile_id: profileId
    });
    
    // search item with filter function
    const store = db.loadStore('users');
    const item = await store.getFirst(x => x.id === 1);
    // get first user whos primary key value is 1
    const item = await store.getFirst(1);
    // get all users whos index.primary key value is between 1 and 2
    const item = await store.get([1, 2]);
    // get user with id 12323 and with 1 level of ralationships
    const userWithRelatedEntities = await store.getRelatedEntities('12323', 1);
```
</details>
