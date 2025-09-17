module.exports = {
    config: {
        name: "resume",
    },
    run: async (client, message, args) => {
        if (client.global.paused) {
            if (client.global.captchadetected) {
                client.global.captchadetected = false;
            }
            client.global.paused = false;
            client.rpc("update");
            try { await message.delete(); } catch (e) {}
        } else {
            try { await message.delete(); } catch (e) {}
        }
    },
};
