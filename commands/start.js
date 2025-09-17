module.exports = {
    config: {
        name: "start",
    },
    run: async (client, message, args) => {
        if (client.global.paused) {
            if (client.global.captchadetected) {
                client.global.captchadetected = false;
            }
            client.global.paused = false;
            client.rpc("update");
            try { await message.delete(); } catch (e) {}
            setTimeout(() => {
                require("../utils/farm.js")(client, message);
            }, 1000);
        } else {
            try { await message.delete(); } catch (e) {}
        }
    },
};
