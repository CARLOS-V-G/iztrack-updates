const bcrypt = require("bcryptjs");

bcrypt
    .hash("izTrack2003224#Meuamor2003224#", 10)
    .then((hash) => {
        console.log("HASH:", hash);
    });