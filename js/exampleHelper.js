const createDummyRecord = async (db) => {
    const dummyDisplayName = ['Pista', 'Julcsa', 'Bozsi', 'Rozsa', 'Margit', 'Istvan'];
    const dummyUserName = ['pista_miskolczi', 'julcsa_nagy', 'bozsi_12', 'rozsa74', 'margit52', 'istvan89'];
    const dummyComment = ['Hello world!!!', 'Lorem ipsum ....', 'Hey-Ho Hey-Ho', 'Test comment!', 'Have a nice day!', 'Good morning'];
    const dummyDate = Date.now();
    const idx = Math.floor(Math.random() * dummyDisplayName.length);
    // create a new user (note: we must update profile id later)
    const userId = await db.loadStore('users').add({
        username: dummyUserName[idx],
        date: dummyDate
    });

    // create a new profile for the user
    const profileId = await db.loadStore('profiles').add({
        displayName: dummyDisplayName[idx],
        user_id: userId,
    });

    let commentId = Math.floor(Math.random() * dummyComment.length);
    // save a new comment
    await db.loadStore('comments').add({
        message: dummyComment[commentId] + '#1',
        user_id: userId,
    });

    commentId = Math.floor(Math.random() * dummyComment.length);
    await db.loadStore('comments').add({
        message: dummyComment[commentId] + '#2',
        user_id: userId,
    });

    commentId = Math.floor(Math.random() * dummyComment.length);
    await db.loadStore('comments').add({
        message: dummyComment[idx] + '#3',
        user_id: userId,
    });
    // update user data with profile id
    await db.loadStore('users').update({
        id: userId,
        profile_id: profileId
    });
    return;
};

const getDummyStoreScheme = (storeName) => {

    if (storeName === 'users') {
        return {
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
    }

    if (storeName === 'comments') {
        return {
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
            ],
            relationships: {
                hasOne: {
                    author: {
                        source: 'user_id',
                        target: 'users.id'
                    }
                }
            }
        };
    }

    if (storeName === 'profiles') {
        return {
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
    }

    return {
        name: storeName,
        columns: [
            {
                name: 'id',
                primaryKey: true,
                autoIncrement: true,
            },
            {
                name: 'text',
                index: true,
                unique: false
            },
            {
                name: 'date',
                index: true,
                unique: true
            }
        ]
    };
};
