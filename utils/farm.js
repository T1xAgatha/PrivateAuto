const axios = require('axios');
const { spawn } = require('child_process');
const { logger } = require("./logger");

let isCaptchaListenerRegistered = false;
let isJailListenerRegistered = false;

let captchaRetries = 0;

module.exports = async (client, message) => {
    if (!isCaptchaListenerRegistered) {
    client.on('captchaDetected', (captchaMessage) => {
        logger.info("Farm", "Event", "Sự kiện 'captchaDetected' đã được bắt. Bắt đầu giải CAPTCHA...");
        solveCaptchaAndRespond(client, captchaMessage);
    });
    isCaptchaListenerRegistered = true;
    logger.info("Farm", "System", "Captcha listener đã được đăng ký thành công.");
}
    if (!isJailListenerRegistered) {
        client.on('messageCreate', async (msg) => {
            try {
                if (!msg || msg.channel?.id !== client.config.channelid) return;
                if (msg.author?.id !== "555955826880413696") return;
                if (!Array.isArray(msg.embeds) || msg.embeds.length === 0) return;
                const embed = msg.embeds[0] || {};
                const desc = String(embed.description || "").toLowerCase();
                const fields = Array.isArray(embed.fields) ? embed.fields : [];
                const field0Name = (fields[0] && fields[0].name ? String(fields[0].name) : "").toLowerCase();
                const field0Value = (fields[0] && fields[0].value ? String(fields[0].value) : "").toLowerCase();
                const isJailDesc = desc.includes("epic guard") && desc.includes("you are in the jail");
                const isJailPrompt = field0Name.includes("what will you do?") && field0Value.includes("`protest`") && field0Value.includes("`kill`");
                if (isJailDesc && isJailPrompt) {
                    logger.info("Farm", "Captcha/Jail", "Phát hiện jail prompt → gửi 'protest' để gọi lại captcha");
                    await client.queueSend(msg.channel, { content: "protest" });
                }
            } catch (e) {
                logger.warn("Farm", "Captcha/Jail", `Xử lý jail prompt thất bại: ${e.message}`);
            }
        });
        isJailListenerRegistered = true;
        logger.info("Farm", "System", "Jail listener đã được đăng ký thành công.");
    }
    if (client.global.paused || client.global.captchadetected) return;
    logger.info("Farm", "Paused", client.global.paused);
    let channel = client.channels.cache.get(client.config.channelid);

    if (client.config.settings.inventory.check) {
        inventory(client, channel);
    } else {
        checkcooldowns(client, channel);
    }
};

/**
 * INVENTORY & COOLDOWN
 *
 */
async function solveCaptchaAndRespond(client, message) {
    const attachment = message.attachments.first(); // Lấy file đính kèm đầu tiên
    if (!attachment || !attachment.url) {
        logger.warn("Farm", "Captcha", "Tin nhắn CAPTCHA không chứa file đính kèm (attachment) hợp lệ.");
        return;
    }
    const imageUrl = attachment.url;    

    try {
        const response = await axios.get(imageUrl, { responseType: "arraybuffer" });

        const pythonProcess = spawn("python", ["predict_item.py"]);

        // Gửi dữ liệu ảnh vào stdin của Python
        pythonProcess.stdin.write(response.data);
        pythonProcess.stdin.end();

        let stdout = "";
        let stderr = "";

        // Lắng nghe kết quả từ Python
        pythonProcess.stdout.on("data", (data) => {
            stdout += data.toString();
        });

        // *** QUAN TRỌNG: Lắng nghe lỗi từ Python ***
        pythonProcess.stderr.on("data", (data) => {
            stderr += data.toString();
        });

        // Chờ cho tiến trình Python kết thúc
        await new Promise((resolve) => {
            pythonProcess.on("close", resolve);
        });

        // Ghi lại bất kỳ cảnh báo nào từ stderr để chúng ta biết
        if (stderr) {
           logger.warn("Farm", "Python Warnings", stderr.trim());
        }

        // Chỉ dừng lại hoàn toàn nếu stderr chứa dấu hiệu của một lỗi CRASH thực sự
        if (stderr && (stderr.toLowerCase().includes("traceback") || stderr.toLowerCase().includes("error:"))) {
            logger.warn("Farm", "Captcha", `Phát hiện lỗi nghiêm trọng từ Python, dừng giải: ${stderr.trim()}`);
            client.global.captchadetected = false; // Reset cờ
            return; // Chỉ dừng lại khi có lỗi thực sự
        }


        // Kiểm tra kết quả rỗng
        const answers = stdout.trim().split(",");
        if (!stdout.trim() || !answers.length || (answers.length === 1 && !answers[0])) {
            logger.warn("Farm", "Captcha", "Python đã không trả về bất kỳ đáp án nào.");
            // Logic retry sẽ được kích hoạt ở dưới do captchadetected vẫn là true
        } else {
            logger.info("Farm", "Captcha", `Answers received: ${answers.join(", ")}`);
        // Phân tích confidence từ stderr (dạng: "CONF: label=xx.x%, label2=yy.y%, ...")
            let parsedConfs = [];
            try {
                const confLineMatch = stderr.split("\n").find((l) => l.trim().startsWith("CONF:"));
                if (confLineMatch) {
                const confPairs = confLineMatch.replace(/^.*CONF:\s*/i, "").split(/\s*,\s*/);
                parsedConfs = confPairs
                    .map((pair) => {
                        const m = pair.match(/(.+?)=([0-9]+\.?[0-9]*)%/);
                        if (!m) return null;
                        return { label: m[1].trim(), confidence: parseFloat(m[2]) };
                    })
                    .filter(Boolean);
                }
            } catch {}
            // Quy tắc gửi: nếu top1 >= 80% thì chỉ gửi 1 đáp án, ngược lại gửi cả 3
            const topConf = parsedConfs.length > 0 ? parsedConfs[0].confidence : null;
            const shouldSendSingle = typeof topConf === "number" && topConf >= 85;
            const toSend = shouldSendSingle ? [answers[0]] : answers.slice(0, 3);

            logger.info(
                "Farm",
                "Captcha",
                shouldSendSingle
                    ? `Confidence ${topConf?.toFixed(1)}% >= 85%. Sending single: ${toSend[0]}`
                    : `Confidence ${topConf != null ? topConf.toFixed(1) + '%' : 'N/A'} < 85%. Sending top ${toSend.length}: ${toSend.join(", ")}`
            );
            for (const answer of toSend) {
                if (!answer) continue;
                if (answer.toLowerCase().startsWith("error:")) {
                    logger.warn("Farm", "Captcha", `Lỗi đã biết từ Python: ${answer}`);
                    client.global.captchadetected = false;
                    return;
                }
                await message.channel.send(answer);
                await client.delay(1000);
            }
        }

        // Logic kiểm tra thành công/thất bại sau một khoảng thời gian
        setTimeout(async () => {
            if (captchaRetries === 0 && client.global.captchadetected) {
                captchaRetries++;
                await client.queueSend(message.channel, { content: "rpg jail" });
                logger.warn("Farm", "Captcha", "Retrying captcha (attempt 2) - sent 'rpg jail', waiting for jail prompt to auto 'protest'.");
                // === DÒNG GÂY LỖI ĐÃ ĐƯỢC XÓA Ở ĐÂY ===
            } else if (captchaRetries >= 1 && client.global.captchadetected) {
                logger.warn("Farm", "Captcha", "Failed to solve CAPTCHA after two attempts.");
                client.global.captchadetected = false;
                captchaRetries = 0;
                client.global.paused = true;
                await message.channel.send(
                    "@everyone Bot đã thử 2 lần nhưng không giải được captcha. Bot tạm dừng, vui lòng resume thủ công."
                );
            } else {
                client.global.captchadetected = false;
                captchaRetries = 0;
                client.global.paused = false;
                logger.info("Farm", "Captcha", "Captcha solved successfully, resuming farm.");
            }
        }, 8000); // Tăng thời gian chờ lên 8s để chắc chắn

    } catch (err) {
        logger.warn("Farm", "Captcha", `Lỗi trong quá trình xử lý CAPTCHA: ${err.message}`);
        client.global.captchadetected = false;
    }
}

async function inventory(client, channel, type = null) {
    if (client.global.captchadetected) return;
    client.global.paused = true;
    logger.info("Farm", "Inventory", `Paused: ${client.global.paused}`);
    logger.info("Farm", "Inventory", `Getting Inventory ...`);

    await client.queueSend(channel, { content: "rpg inventory" }).then(async () => {
        let message = null;
        do {
            let lastMessages = await channel.messages.fetch({ limit: 1 });
            if (lastMessages.size > 0) {
                message = lastMessages.last();
                if (message.author.id !== "555955826880413696") {
                    await new Promise((resolve) => setTimeout(resolve, 1000));
                }
            }
        } while (message && message.author.id !== "555955826880413696");

        if (!message || !message.embeds || !message.embeds[0] || !message.embeds[0].fields) {
            logger.warn("Farm", "Inventory", "No embed fields found in inventory response");
            client.global.paused = false;
            return;
        }
        const fields = message.embeds[0].fields;

        if (type === "sell") {
            let itemsValue = null;

            for (const field of fields) {
                if (field.name === "Items") {
                    itemsValue = field.value;
                    break;
                }
            }
            const sellTypes = client.config.settings.inventory.sell.types;
            const itemsitemsToCheck = [];

            for (const type in sellTypes) {
                if (sellTypes[type]) {
                    itemsitemsToCheck.push(type);
                }
            }
            const itemslines = itemsValue.split("\n");
            let inventorysellloopcounter = 0;
            for (const line of itemslines) {
                const trimmedLine = line.trim();
                if (trimmedLine.toLowerCase().includes("no items")) {
                    logger.warn("Farm", "Inventory", `No items left`);
                } else {
                    for (const item of itemsitemsToCheck) {
                        if (trimmedLine.includes(item)) {
                            const regex = new RegExp(
                                `\\*\\*${item}\\*\\*: (\\d+)`
                            );
                            const match = trimmedLine.match(regex);
                            if (match && match.length > 1) {
                                const count = match[1];

                                switch (inventorysellloopcounter) {
                                    case 0:
                                        await client.delay(2500);
                                        inventorysellloopcounter++;
                                        break;
                                    case 1:
                                        await client.delay(3500);
                                        inventorysellloopcounter++;
                                        break;
                                    case 2:
                                        await client.delay(4500);
                                        inventorysellloopcounter++;
                                        break;
                                    case 4:
                                        await client.delay(5500);
                                        inventorysellloopcounter++;
                                        break;
                                    default:
                                        await client.delay(6500);
                                        inventorysellloopcounter++;
                                        break;
                                }

                                await sell(
                                    client,
                                    channel,
                                    item,
                                    count,
                                    "inventory"
                                );
                            }
                        }
                    }
                }
            }
            client.global.paused = false;
            logger.info("Farm", "Inventory", `Paused: ${client.global.paused}`);
        } else if (type === "use") {
            let useconsumablesValue = null;

            for (const field of fields) {
                if (field.name === "Consumables") {
                    useconsumablesValue = field.value;
                    break;
                }
            }

            const lootboxTypes = client.config.settings.inventory.lootbox.types;
            const useconsumablesitemsToCheck = [];

            for (const type in lootboxTypes) {
                if (lootboxTypes[type]) {
                    useconsumablesitemsToCheck.push(type);
                }
            }

            const useconsumableslines = useconsumablesValue.split("\n");
            let usecooldown = 0;
            let inventoryuseloopcounter = 0;
            for (const line of useconsumableslines) {
                const trimmedLine = line.trim();

                for (const item of useconsumablesitemsToCheck) {
                    if (trimmedLine.includes(item)) {
                        const regex = new RegExp(`\\*\\*${item}\\*\\*: (\\d+)`);
                        const match = trimmedLine.match(regex);
                        if (match && match.length > 1) {
                            const count = match[1];

                            if (
                                item.includes("lootbox") &&
                                client.config.settings.inventory.lootbox.autouse
                            ) {
                                switch (inventoryuseloopcounter) {
                                    case 0:
                                        await client.delay(2500);
                                        break;
                                    case 1:
                                        await client.delay(5500);
                                        break;
                                    case 2:
                                        await client.delay(7500);
                                        break;
                                    case 4:
                                        await client.delay(9500);
                                        break;
                                    default:
                                        await client.delay(11500);
                                        break;
                                }

                                await use(
                                    client,
                                    channel,
                                    item,
                                    count,
                                    "inventory"
                                );
                                inventoryuseloopcounter++;
                            }
                        }
                    }
                }
            }
            client.global.paused = false;
            logger.info("Farm", "Inventory", `Paused: ${client.global.paused}`);
        } else {
            let consumablesValue = null;
            let itemsValueForRuby = null;

            for (const field of fields) {
                if (field.name === "Consumables") {
                    consumablesValue = field.value;
                    break;
                }
            }
            for (const field of fields) {
                if (field.name === "Items") {
                    itemsValueForRuby = field.value;
                    break;
                }
            }

            const lootboxTypes = client.config.settings.inventory.lootbox.types;
            const farmseedTypes = client.config.commands.progress.farm.types;
            const consumablesitemsToCheck = [
                "life potion",
                "time cookie",
                "common card",
                // While rubies are listed under Items, include here for completeness
                // in case EpicRPG changes layout in the future.
                "ruby",
            ];

            for (const type in lootboxTypes) {
                if (lootboxTypes[type]) {
                    consumablesitemsToCheck.push(type);
                }
            }
            for (const type in farmseedTypes) {
                if (farmseedTypes[type]) {
                    consumablesitemsToCheck.push(type);
                }
            }

            const consumableslines = consumablesValue.split("\n");
            // Parse rubies from Items section if present
            if (itemsValueForRuby) {
                try {
                    const lines = itemsValueForRuby.split("\n");
                    const rubyLine = lines.find((l) => l.toLowerCase().includes("ruby"));
                    if (rubyLine) {
                        const match = rubyLine.match(/rub(?:y|ies)\s*:\s*([\d,]+)/i) || rubyLine.match(/\*\*rub(?:y|ies)\*\*:\s*([\d,]+)/i);
                        if (match && match[1]) {
                            const newRubyCount = parseInt(match[1].replace(/,/g, ''), 10) || 0;
                            const oldRubyCount = client.global.inventory.rubies || 0;
                            client.global.inventory.rubies = newRubyCount;
                            client.global.inventory.rubiesLastSeen = Date.now();
                            
                            if (oldRubyCount !== newRubyCount) {
                                const change = newRubyCount - oldRubyCount;
                                const changeText = change > 0 ? `+${change}` : `${change}`;
                                logger.info("Farm", "Inventory", `Rubies: ${oldRubyCount} → ${newRubyCount} (${changeText})`);
                            } else {
                                logger.info("Farm", "Inventory", `Rubies: ${newRubyCount} (no change)`);
                            }
                        }
                    }
                } catch (e) {}
            }
            let usecooldown = 0;
            let inventoryuseloopcounter = 0;
            for (const line of consumableslines) {
                const trimmedLine = line.trim();

                for (const item of consumablesitemsToCheck) {
                    if (trimmedLine.includes(item)) {
                        const regex = new RegExp(`\\*\\*${item}\\*\\*: (\\d+)`);
                        const match = trimmedLine.match(regex);
                        if (match && match.length > 1) {
                            const count = match[1];
                            if (
                                item === "life potion" &&
                                client.config.settings.inventory.lifepotion
                                    .autouse
                            ) {
                                client.global.inventory.lifepotion = count;
                                client.global.limits.lifepotionhplimit =
                                    client.config.settings.inventory.lifepotion.hplimit;
                            } else if (item === "time cookie") {
                                client.global.inventory.timecookie = count;
                            } else if (
                                item.includes("lootbox") &&
                                client.config.settings.inventory.lootbox.autouse
                            ) {
                                switch (inventoryuseloopcounter) {
                                    case 0:
                                        await client.delay(2500);
                                        break;
                                    case 1:
                                        await client.delay(5500);
                                        break;
                                    case 2:
                                        await client.delay(7500);
                                        break;
                                    case 4:
                                        await client.delay(9500);
                                        break;
                                    default:
                                        await client.delay(11500);
                                        break;
                                }

                                await use(
                                    client,
                                    channel,
                                    item,
                                    count,
                                    "inventory"
                                );
                                inventoryuseloopcounter++;
                            } else if (
                                item.includes("seed") &&
                                client.config.commands.progress.farm.enable
                            ) {
                                switch (item) {
                                    case "seed":
                                        client.global.inventory.farm.seed =
                                            count;
                                        break;
                                    case "potato seed":
                                        client.global.inventory.farm.potatoseed =
                                            count;
                                        break;
                                    case "carrot seed":
                                        client.global.inventory.farm.carrotseed =
                                            count;
                                        break;
                                    case "bread seed":
                                        client.global.inventory.farm.breadseed =
                                            count;
                                        break;
                                    default:
                                        break;
                                }
                            }
                        }
                    }
                }
            }
            //
            client.global.paused = false;
            logger.info("Farm", "Inventory", `Paused: ${client.global.paused}`);
            if (usecooldown > 0) {
                setTimeout(() => {
                    checkcooldowns(client, channel);
                }, 4500 + usecooldown);
            } else {
                setTimeout(() => {
                    checkcooldowns(client, channel);
                }, 4500);
            }
        }
    });
}

async function checkcooldowns(client, channel) {
    await client.queueSend(channel, { content: "rpg cd" }).then(async () => {
        let message = null;
        do {
            let lastMessages = await channel.messages.fetch({ limit: 1 });
            if (lastMessages.size > 0) {
                message = lastMessages.last();
                if (message.author.id !== "555955826880413696") {
                    await new Promise((resolve) => setTimeout(resolve, 1000));
                }
            }
        } while (message && message.author.id !== "555955826880413696");

        const itemsToCheck = [
            "daily",
            "weekly",
            "lootbox",
            "card hand",
            "vote",
            "hunt",
            "adventure",
            "training",
            "duel",
            "quest",
            "epic quest",
            "chop",
            "fish",
            "pickup",
            "mine",
            "horse breeding",
            "horse race",
            "arena",
            "dungeon",
            "miniboss",
            "farm",
        ];
        let dailycooldown,
            weeklycooldown,
            votecooldown,
            huntcooldown,
            adventurecooldown,
            trainingcooldown,
            farmcooldown,
            chopcooldown,
            fishcooldown,
            pickupcooldown,
            minecooldown,
            axecooldown,
            bowsawcooldown,
            chainsawcooldown,
            netcooldown,
            boatcooldown,
            bigboatcooldown,
            laddercooldown,
            tractorcooldown,
            greenhousecooldown,
            pickaxecooldown,
            drillcooldown,
            dynamitecooldown,
            progressworkingdisabled,
            progressworkingmultivalue;

        for (const category in client.config.commands) {
            const subCommands = client.config.commands[category];
            for (const subCommand in subCommands) {
                if (subCommands[subCommand]) {
                    if (subCommand === "daily") {
                        dailycooldown = 0;
                    }
                    if (subCommand === "weekly") {
                        weeklycooldown = 0;
                    }
                    if (subCommand === "vote") {
                        votecooldown = 0;
                    }
                    if (subCommand === "hunt") {
                        huntcooldown = 0;
                    }
                    if (subCommand === "adventure") {
                        adventurecooldown = 0;
                    }
                    if (subCommand === "training") {
                        trainingcooldown = 0;
                    }

                    if (category === "progress" && subCommand === "farm") {
                        farmcooldown = 0;

                        /*  const workingCommands = subCommands["working"];

                        if (
                            client.config.commands.progress.farm.enable &&
                            Object.values(workingCommands).some(
                                (value) => value === true
                            )
                        ) {
                            progressworkingdisabled = true;
                            logger.warn(
                                "Farm",
                                "Progress",
                                "You cannot use both working and farm commands at the same time. working commands will be disabled and farm will be used by default"
                            );
                        }*/
                    }

                    if (category === "progress" && subCommand === "working") {
                        const progressCommands = subCommands[subCommand];
                        if (progressCommands) {
                            if (
                                Object.values(progressCommands).filter(
                                    (value) => value
                                ).length > 1
                            ) {
                                logger.warn(
                                    "Farm",
                                    "Progress",
                                    "Multiple working commands detected, chop will be used by default"
                                );
                                progressworkingmultivalue = true;
                                client.global.working.type = "chop";
                                chopcooldown = 0;
                            } else {
                                progressworkingmultivalue = false;
                            }
                        }
                    }
                }
            }
        }
        message.embeds[0].fields.forEach((field) => {
            const { name, value } = field;
            if (name === ":lock: Locked") {
                return;
            }
            const lines = value.split("\n");
            lines.forEach((line) => {
                const trimmedLine = line.trim();
                itemsToCheck.forEach((item) => {
                    if (trimmedLine.includes(item)) {
                        const cooldown = extractCooldown(trimmedLine);
                        if (cooldown) {
                            if (
                                item === "daily" &&
                                client.config.commands.rewards.daily
                            ) {
                                dailycooldown = timetoms(cooldown);
                                logger.info(
                                    "Farm",
                                    "Cooldowns",
                                    `Daily Cooldown: ${dailycooldown}ms`
                                );
                            }
                            if (
                                item === "weekly" &&
                                client.config.commands.rewards.weekly
                            ) {
                                weeklycooldown = timetoms(cooldown);
                                logger.info(
                                    "Farm",
                                    "Cooldowns",
                                    `Weekly Cooldown: ${weeklycooldown}ms`
                                );
                            }
                            if (
                                item === "vote" &&
                                client.config.commands.rewards.vote.enable
                            ) {
                                votecooldown = timetoms(cooldown);
                                logger.info(
                                    "Farm",
                                    "Cooldowns",
                                    `Vote Cooldown: ${votecooldown}ms`
                                );
                            }
                            if (
                                item === "hunt" &&
                                client.config.commands.experience.hunt
                            ) {
                                huntcooldown = timetoms(cooldown);
                                logger.info(
                                    "Farm",
                                    "Cooldowns",
                                    `Hunt Cooldown: ${huntcooldown}ms`
                                );
                            }
                            if (
                                item === "adventure" &&
                                client.config.commands.experience.adventure
                            ) {
                                adventurecooldown = timetoms(cooldown);
                                logger.info(
                                    "Farm",
                                    "Cooldowns",
                                    `Adventure Cooldown: ${adventurecooldown}ms`
                                );
                            }
                            if (
                                item === "training" &&
                                client.config.commands.experience.training
                            ) {
                                trainingcooldown = timetoms(cooldown);
                                logger.info(
                                    "Farm",
                                    "Cooldowns",
                                    `Training Cooldown: ${trainingcooldown}ms`
                                );
                            }
                            if (
                                item === "farm" &&
                                client.config.commands.progress.farm
                            ) {
                                farmcooldown = timetoms(cooldown);
                                logger.info(
                                    "Farm",
                                    "Cooldowns",
                                    `Farm Cooldown: ${farmcooldown}ms`
                                );
                            }
                            if (item === "chop") {
                                if (
                                    client.config.commands.progress.working.chop
                                ) {
                                    chopcooldown = timetoms(cooldown);
                                    logger.info(
                                        "Farm",
                                        "Cooldowns",
                                        `Chop Cooldown: ${chopcooldown}ms`
                                    );
                                }
                                if (
                                    client.config.commands.progress.working
                                        .fish &&
                                    !progressworkingmultivalue
                                ) {
                                    fishcooldown = timetoms(cooldown);
                                    logger.info(
                                        "Farm",
                                        "Cooldowns",
                                        `Fish Cooldown: ${fishcooldown}ms`
                                    );
                                }
                                if (
                                    (client.config.commands.progress.working.pickup ||
                                     client.config.commands.progress.working.greenhouse) &&
                                    !progressworkingmultivalue
                                ) {
                                    pickupcooldown = timetoms(cooldown);
                                    logger.info(
                                        "Farm",
                                        "Cooldowns",
                                        `Pickup Cooldown: ${pickupcooldown}ms`
                                    );
                                }
                                if (
                                    client.config.commands.progress.working
                                        .mine &&
                                    !progressworkingmultivalue
                                ) {
                                    minecooldown = timetoms(cooldown);
                                    logger.info(
                                        "Farm",
                                        "Cooldowns",
                                        `Mine Cooldown: ${minecooldown}ms`
                                    );
                                }
                                if (
                                    client.config.commands.progress.working
                                        .axe &&
                                    !progressworkingmultivalue
                                ) {
                                    axecooldown = timetoms(cooldown);
                                    logger.info(
                                        "Farm",
                                        "Cooldowns",
                                        `Axe Cooldown: ${axecooldown}ms`
                                    );
                                }
                                if (
                                    client.config.commands.progress.working
                                        .bowsaw &&
                                    !progressworkingmultivalue
                                ) {
                                    bowsawcooldown = timetoms(cooldown);
                                    logger.info(
                                        "Farm",
                                        "Cooldowns",
                                        `Bowsaw Cooldown: ${bowsawcooldown}ms`
                                    );
                                }
                                if (
                                    client.config.commands.progress.working
                                        .chainsaw &&
                                    !progressworkingmultivalue
                                ) {
                                    chainsawcooldown = timetoms(cooldown);
                                    logger.info(
                                        "Farm",
                                        "Cooldowns",
                                        `Chainsaw Cooldown: ${chainsawcooldown}ms`
                                    );
                                }
                                if (
                                    client.config.commands.progress.working
                                        .net &&
                                    !progressworkingmultivalue
                                ) {
                                    netcooldown = timetoms(cooldown);
                                    logger.info(
                                        "Farm",
                                        "Cooldowns",
                                        `Net Cooldown: ${netcooldown}ms`
                                    );
                                }
                                if (
                                    client.config.commands.progress.working
                                        .boat &&
                                    !progressworkingmultivalue
                                ) {
                                    boatcooldown = timetoms(cooldown);
                                    logger.info(
                                        "Farm",
                                        "Cooldowns",
                                        `Boat Cooldown: ${boatcooldown}ms`
                                    );
                                }
                                if (
                                    client.config.commands.progress.working
                                        .bigboat &&
                                    !progressworkingmultivalue
                                ) {
                                    bigboatcooldown = timetoms(cooldown);
                                    logger.info(
                                        "Farm",
                                        "Cooldowns",
                                        `Bigboat Cooldown: ${bigboatcooldown}ms`
                                    );
                                }
                                if (
                                    client.config.commands.progress.working
                                        .ladder &&
                                    !progressworkingmultivalue
                                ) {
                                    laddercooldown = timetoms(cooldown);
                                    logger.info(
                                        "Farm",
                                        "Cooldowns",
                                        `Ladder Cooldown: ${laddercooldown}ms`
                                    );
                                }
                                if (
                                    client.config.commands.progress.working
                                        .tractor &&
                                    !progressworkingmultivalue
                                ) {
                                    tractorcooldown = timetoms(cooldown);
                                    logger.info(
                                        "Farm",
                                        "Cooldowns",
                                        `Tractor Cooldown: ${tractorcooldown}ms`
                                    );
                                }
                                if (
                                    client.config.commands.progress.working
                                        .pickaxe &&
                                    !progressworkingmultivalue
                                ) {
                                    pickaxecooldown = timetoms(cooldown);
                                    logger.info(
                                        "Farm",
                                        "Cooldowns",
                                        `Pickaxe Cooldown: ${pickaxecooldown}ms`
                                    );
                                }
                                if (
                                    client.config.commands.progress.working
                                        .drill &&
                                    !progressworkingmultivalue
                                ) {
                                    drillcooldown = timetoms(cooldown);
                                    logger.info(
                                        "Farm",
                                        "Cooldowns",
                                        `Drill Cooldown: ${drillcooldown}ms`
                                    );
                                }
                                if (
                                    client.config.commands.progress.working
                                        .dynamite &&
                                    !progressworkingmultivalue
                                ) {
                                    dynamitecooldown = timetoms(cooldown);
                                    logger.info(
                                        "Farm",
                                        "Cooldowns",
                                        `Dynamite Cooldown: ${dynamitecooldown}ms`
                                    );
                                }
                            }
                        }
                    }
                });
            });
        });

        if (client.config.commands.rewards.daily) {
            if (dailycooldown <= 0) {
                client.global.daily = true;
                setTimeout(() => {
                    daily(client, channel);
                }, 1400);
            }
        }
        if (client.config.commands.rewards.weekly) {
            if (dailycooldown <= 0) {
                if (weeklycooldown <= 0) {
                    client.global.weekly = true;
                    setTimeout(() => {
                        weekly(client, channel);
                    }, 2700);
                }
            } else {
                if (weeklycooldown <= 0) {
                    client.global.weekly = true;
                    setTimeout(() => {
                        weekly(client, channel);
                    }, 1400);
                }
            }
        }
        if (client.config.commands.rewards.vote.enable) {
            if (dailycooldown <= 0 || weeklycooldown <= 0) {
                if (votecooldown <= 0) {
                    setTimeout(() => {
                        vote(client, channel);
                    }, 2700);
                }
            } else {
                if (votecooldown <= 0) {
                    setTimeout(() => {
                        vote(client, channel);
                    }, 1400);
                }
            }
        }
        if (client.config.commands.experience.hunt) {
            if (dailycooldown <= 0) {
                if (huntcooldown > 0) {
                    hunt(client, channel, huntcooldown + 2000);
                } else {
                    hunt(client, channel, 2000);
                }
            } else {
                if (huntcooldown > 0) {
                    setTimeout(() => {
                        hunt(client, channel);
                    }, huntcooldown);
                } else {
                    hunt(client, channel);
                }
            }
        }
        if (client.config.commands.experience.adventure) {
            if (adventurecooldown > 0) {
                adventure(client, channel, adventurecooldown + 2000);
            } else {
                adventure(client, channel, 3500);
            }
        }
        if (client.config.commands.experience.training) {
            if (trainingcooldown > 0) {
                training(client, channel, trainingcooldown + 2000);
            } else {
                training(client, channel, 3500);
            }
        }

        if (client.config.commands.progress.farm.enable) {
            if (farmcooldown > 0) {
                farm(client, channel, farmcooldown + 2000);
            } else {
                farm(client, channel, 5500);
            }
        }
        if (
            client.config.commands.progress.working.chop ||
            progressworkingmultivalue
        ) {
            if (chopcooldown > 0) {
                working(client, channel, "chop", chopcooldown + 3500);
            } else {
                working(client, channel, "chop", 7500);
            }
        }

        if (
            client.config.commands.progress.working.fish &&
            !progressworkingmultivalue
        ) {
            if (fishcooldown > 0) {
                working(client, channel, "fish", fishcooldown + 3500);
            } else {
                working(client, channel, "fish", 7500);
            }
        }
        if (
            client.config.commands.progress.working.pickup &&
            !progressworkingmultivalue
        ) {
            if (pickupcooldown > 0) {
                working(client, channel, "pickup", pickupcooldown + 3500);
            } else {
                working(client, channel, "pickup", 7500);
            }
        }
        if (
            client.config.commands.progress.working.mine &&
            !progressworkingmultivalue
        ) {
            if (minecooldown > 0) {
                working(client, channel, "mine", minecooldown + 3500);
            } else {
                working(client, channel, "mine", 7500);
            }
        }
        if (
            client.config.commands.progress.working.axe &&
            !progressworkingmultivalue
        ) {
            if (axecooldown > 0) {
                working(client, channel, "axe", axecooldown + 3500);
            } else {
                working(client, channel, "axe", 7500);
            }
        }
        if (
            client.config.commands.progress.working.bowsaw &&
            !progressworkingmultivalue
        ) {
            if (bowsawcooldown > 0) {
                working(client, channel, "bowsaw", bowsawcooldown + 3500);
            } else {
                working(client, channel, "bowsaw", 7500);
            }
        }
        if (
            client.config.commands.progress.working.net &&
            !progressworkingmultivalue
        ) {
            if (netcooldown > 0) {
                working(client, channel, "net", netcooldown + 3500);
            } else {
                working(client, channel, "net", 7500);
            }
        }
        if (
            client.config.commands.progress.working.boat &&
            !progressworkingmultivalue
        ) {
            if (boatcooldown > 0) {
                working(client, channel, "boat", boatcooldown + 3500);
            } else {
                working(client, channel, "boat", 7500);
            }
        }
        if (
            client.config.commands.progress.working.bigboat &&
            !progressworkingmultivalue
        ) {
            if (bigboatcooldown > 0) {
                working(client, channel, "bigboat", bigboatcooldown + 3500);
            } else {
                working(client, channel, "bigboat", 7500);
            }
        }
        if (
            client.config.commands.progress.working.ladder &&
            !progressworkingmultivalue
        ) {
            if (laddercooldown > 0) {
                working(client, channel, "ladder", laddercooldown + 3500);
            } else {
                working(client, channel, "ladder", 7500);
            }
        }
        if (
            client.config.commands.progress.working.tractor &&
            !progressworkingmultivalue
        ) {
            if (tractorcooldown > 0) {
                working(client, channel, "tractor", tractorcooldown + 3500);
            } else {
                working(client, channel, "tractor", 7500);
            }
        }
        if (
            client.config.commands.progress.working.greenhouse &&
            !progressworkingmultivalue
        ) {
            if (pickupcooldown > 0) {
                working(client, channel, "greenhouse", pickupcooldown + 3500);
            } else {
                working(client, channel, "greenhouse", 7500);
            }
        }
        if (
            client.config.commands.progress.working.chainsaw &&
            !progressworkingmultivalue
        ) {
            if (chainsawcooldown > 0) {
                working(client, channel, "chainsaw", chainsawcooldown + 3500);
            } else {
                working(client, channel, "chainsaw", 7500);
            }
        }
        if (
            client.config.commands.progress.working.pickaxe &&
            !progressworkingmultivalue
        ) {
            if (pickaxecooldown > 0) {
                working(client, channel, "pickaxe", pickaxecooldown + 3500);
            } else {
                working(client, channel, "pickaxe", 7500);
            }
        }
        if (
            client.config.commands.progress.working.drill &&
            !progressworkingmultivalue
        ) {
            if (drillcooldown > 0) {
                working(client, channel, "drill", drillcooldown + 3500);
            } else {
                working(client, channel, "drill", 7500);
            }
        }
        if (
            client.config.commands.progress.working.dynamite &&
            !progressworkingmultivalue
        ) {
            if (dynamitecooldown > 0) {
                working(client, channel, "dynamite", dynamitecooldown + 3500);
            } else {
                working(client, channel, "dynamite", 7500);
            }
        }
    });
}

/**
 * COMMAND FUNCTIONS
 *
 */

// Hàm hunt mới, sử dụng setTimeout thay cho setInterval
async function hunt(client, channel, extratime = 0) {
    setTimeout(async () => {
        if (
            client.global.paused ||
            client.global.captchadetected ||
            client.global.use ||
            client.global.daily ||
            client.global.weekly ||
            client.global.training
        ) {
            // Lên lịch kiểm tra lại nếu bot đang tạm dừng
            return hunt(client, channel, 5000);
        }

        if (client.config.settings.autophrases) {
            setTimeout(async () => {
                await elaina2(client, channel);
            }, 1000);
        }

        await client.queueSend(channel, { content: "rpg hunt" });
        client.global.totalhunt++;
        logger.info(
            "Farm",
            "Hunt",
            `Total Hunt: ${client.global.totalhunt}`
        );

        // Sau khi hoàn thành, lên lịch cho lần chạy tiếp theo
        hunt(client, channel, Math.max(1000, Math.floor(63000 * (client.cooldownScale || 1))));
        
    }, 1000 + extratime);
}


// Hàm adventure mới
async function adventure(client, channel, extratime = 0) {
    setTimeout(async () => {
        if (typeof client.global.working !== 'boolean') {
            client.global.working = false;
        }
        
        if (
            client.global.paused ||
            client.global.captchadetected ||
            client.global.use ||
            client.global.daily ||
            client.global.weekly ||
            client.global.training ||
            client.global.working ||
            client.global.farm
        ) {
            return adventure(client, channel, 5000);
        }
        
        client.global.adventure = true;
        await client.queueSend(channel, { content: "rpg adventure" });
        client.global.totaladventure++;
        logger.info(
            "Farm",
            "Adventure",
            `Total adventure: ${client.global.totaladventure}`
        );
        client.global.adventure = false;

        adventure(client, channel, Math.max(1000, Math.floor(3604000 * (client.cooldownScale || 1))));
        
    }, 1000 + extratime);
}

// Hàm training mới
async function training(client, channel, extratime = 0) {
    setTimeout(async () => {
        if (typeof client.global.working !== 'boolean') {
            client.global.working = false;
        }
        
        if (
            client.global.paused ||
            client.global.captchadetected ||
            client.global.use ||
            client.global.daily ||
            client.global.weekly ||
            client.global.farm ||
            client.global.working ||
            client.global.adventure
        ) {
            return training(client, channel, 5000);
        }

        client.global.training = true;
        await client.queueSend(channel, { content: "rpg training" });
        client.global.totaltraining++;
        logger.info(
            "Farm",
            "Training",
            `Total training: ${client.global.totaltraining}`
        );
        client.global.training = false;
        
        training(client, channel, Math.max(1000, Math.floor(904000 * (client.cooldownScale || 1))));
        
    }, 1000 + extratime);
}

// Hàm farm mới
async function farm(client, channel, extratime = 0) {
    let farmseedtype;

    setTimeout(async () => {
        if (typeof client.global.working !== 'boolean') {
            client.global.working = false;
        }
        
        if (
            client.global.paused ||
            client.global.captchadetected ||
            client.global.use ||
            client.global.daily ||
            client.global.weekly ||
            client.global.training ||
            client.global.working ||
            client.global.adventure
        ) {
            return farm(client, channel, 5000);
        }

        if (client.global.inventory.farm.seed >= 1) {
            farmseedtype = "basic";
        } else if (client.global.inventory.farm.potatoseed >= 1) {
            farmseedtype = "potato seed";
        } else if (client.global.inventory.farm.carrotseed >= 1) {
            farmseedtype = "carrot seed";
        } else if (client.global.inventory.farm.breadseed >= 1) {
            farmseedtype = "bread seed";
        }

        client.global.farm = true;
        await client.queueSend(channel, { content: `rpg farm ${farmseedtype}` });
        client.global.totalworking++;
        logger.info("Farm", "Progress-Farm", `Type: ${farmseedtype}`);
        client.global.farm = false;

        farm(client, channel, Math.max(1000, Math.floor(604000 * (client.cooldownScale || 1))));
        
    }, 1000 + extratime);
}

// Hàm working mới
async function working(client, channel, type, extratime = 0) {
    setTimeout(async () => {
        if (typeof client.global.working !== 'boolean') {
            client.global.working = false;
        }
        
        if (
            client.global.paused ||
            client.global.captchadetected ||
            client.global.use ||
            client.global.daily ||
            client.global.weekly ||
            client.global.adventure ||
            client.global.working ||
            client.global.training
        ) {
            return working(client, channel, type, 5000);
        }

        client.global.working = true;
        await client.queueSend(channel, { content: `rpg ${type}` });
        client.global.totalworking++;
        logger.info("Farm", "Working", `Type: ${type}`);
        client.global.working = false;

        working(client, channel, type, Math.max(1000, Math.floor(304000 * (client.cooldownScale || 1))));
        
    }, 1000 + extratime);
}

async function daily(client, channel) {
    if (
        client.global.paused ||
        client.global.captchadetected ||
        client.global.use
    )
        return;
    await client.queueSend(channel, { content: "rpg daily" }).then(() => {
        logger.info("Farm", "Daily", "Daily Claimed !");
    });
    await client.delay(2500);
    client.global.daily = false;
}
async function weekly(client, channel) {
    if (
        client.global.paused ||
        client.global.captchadetected ||
        client.global.use
    )
        return;
    await client.queueSend(channel, { content: "rpg weekly" }).then(() => {
        logger.info("Farm", "Weekly", "Weekly Claimed !");
    });
    await client.delay(2500);
    client.global.weekly = false;
}

async function vote(client, channel) {
    if (
        client.global.paused ||
        client.global.captchadetected ||
        client.global.use ||
        client.global.daily ||
        client.global.weekly
    )
        return;

    logger.info("Farm", "Vote", `Platform: ${process.platform}`);

    let votebrowserexecute, executeCommand;

    if (process.platform === "win32") {
        votebrowserexecute = "start";
        executeCommand = (command) => client.childprocess.exec(command);
    } else if (process.platform === "darwin") {
        votebrowserexecute = "open";
        executeCommand = (command) =>
            client.childprocess.spawn(command, [
                "https://top.gg/bot/555955826880413696/vote",
            ]);
    } else if (process.platform === "android") {
        return;
    } else if (process.platform === "linux") {
        votebrowserexecute = "xdg-open";
        executeCommand = (command) =>
            client.childprocess.spawn(command, [
                "https://top.gg/bot/555955826880413696/vote",
            ]);
    } else {
        logger.warn("Farm", "Vote", "Unsupported platform!");
        return;
    }

    if (votebrowserexecute) {
        logger.info("Farm", "Vote", "Opening Browser.");
        executeCommand(
            `${votebrowserexecute} https://top.gg/bot/555955826880413696/vote`
        );
    }
}

async function use(client, channel, item, count = "", where = "") {
    if (
        (client.global.paused && where !== "inventory") ||
        client.global.captchadetected
    )
        return;
    client.global.use = true;
    await client.queueSend(channel, { content: `rpg use ${item} ${count}` });
    if (where.trim() !== "") {
        logger.info("Farm", `Use [Requested By ${where}]`, item);
    } else {
        logger.info("Farm", "Use", item);
    }

    if (where === "adventure" || where === "hunt") {
        await client.delay("2500");
    } else {
        await client.delay("1500");
    }
    client.global.use = false;
}

async function sell(client, channel, item, count = "1", where = "") {
    if (client.global.paused && where !== "inventory") return;
    await client.queueSend(channel, { content: `rpg sell ${item} ${count}` });
    logger.info("Farm", "Sell", item);
    // if (where === "inventory") {
    //     await client.delay(2500);
    // }
}

/**
 * OTHER FUNCTIONS
 *
 */

async function elaina2(client, channel) {
    if (client.global.paused || client.global.captchadetected) return;
    client.fs.readFile("./phrases/phrases.json", "utf8", async (err, data) => {
        if (err) {
            console.error(err);
            logger.warn("Farm", "Phrases", "Failed to read phrases.json");
            return;
        }

        const phrasesObject = JSON.parse(data);
        const phrases = phrasesObject.phrases;

        if (!phrases || !phrases.length) {
            logger.alert(
                "Farm",
                "Phrases",
                "Phrases array is undefined or empty."
            );
            return;
        }
        let result = Math.floor(Math.random() * phrases.length);
        let ilu = phrases[result];

        // await channel.sendTyping();

        await channel.send({ content: ilu });
        logger.info("Farm", "Phrases", `Successfuly Sended`);
    });
}

function timetoms(durationString) {
    const regex =
        /(\d+)\s*d\s*|(\d+)\s*h\s*|(\d+)\s*m\s*|(\d+)\s*s\s*|(\d+)\s*$/g;
    const matches = durationString.match(regex);

    if (!matches) return null;

    let milliseconds = 0;

    matches.forEach((match) => {
        const value = parseInt(match.match(/\d+/)[0]);
        if (match.includes("d")) milliseconds += value * 24 * 60 * 60 * 1000;
        else if (match.includes("h")) milliseconds += value * 60 * 60 * 1000;
        else if (match.includes("m")) milliseconds += value * 60 * 1000;
        else if (match.includes("s")) milliseconds += value * 1000;
        else milliseconds += value;
    });

    return milliseconds;
}

function extractCooldown(text) {
    const cooldownRegex = /\(\*\*([^*]+)\*\*\)/;
    const cooldownMatch = text.match(cooldownRegex);
    if (cooldownMatch && cooldownMatch.length > 1) {
        return cooldownMatch[1];
    }
    return null;
}

// Export checkcooldowns function for external use
module.exports.checkcooldowns = checkcooldowns;

