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

const dbScheme = {
    users: {
        id: {
            primaryKey: true,
            autoIncrement: true, 
        },
        username: {
            index: true,
            unique: false
        },
        profile_id: {
            index: true
        },
        date: {
            index: true,
            unique: true
        },
        __relationships: {
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
    },
    comments: {
        id: {
            primaryKey: true,
            autoIncrement: true,                
        },
        message: {
            index: true,
            unique: false                
        },
        user_id: {
            index: true
        },
        date: {
            index: true,
            unique: true
        },
        __relationships: {
            hasOne: {
                author: {
                    source: 'user_id',
                    target: 'users.id'
                }
            }
        }            
    },
    profiles: {
        id: {
            primaryKey: true,
            autoIncrement: true,
        },
        displayName: {
            index: true,
            unique: false
        },
        user_id: {
            index: true
        },
        date: {
            index: true,
            unique: true
        },
        __relationships: {
            hasOne: {
                user: {
                    source: 'user_id',
                    target: 'users.id'
                }
            }
        }            
    }
};
