module.exports = {
    config: {
        name: "pause",
        aliases: ["stop"],
    },
    run: async (client, message, args) => {
        if (client.global.paused) {
            try { await message.delete(); } catch (e) {}
        } else {
            client.global.paused = true;
            client.rpc("update");
            try { await message.delete(); } catch (e) {}
            // process.exit(0);
        }
    },
};
