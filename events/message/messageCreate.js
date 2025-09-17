const { logger } = require("../../utils/logger");

module.exports = async (client, message) => {
    if (message.channel.id !== client.config.channelid) return;

    let msgcontent = message.content.toLowerCase();
    const authorId = message.author.id;
    
    const allowedCaptchaAuthor = "555955826880413696";

    if (authorId === allowedCaptchaAuthor) {
        // --- KHỐI LỆNH PHÁT HIỆN CAPTCHA ---
        if (
            (
                msgcontent.includes("we have to check you are actually playing") ||
                msgcontent.includes("**epic guard**: stop there")
            ) &&
            message.attachments.size > 0
        ) {
            client.global.paused = true;
            client.global.captchadetected = true;
            client.global.totalcaptcha++;
            logger.alert("Bot", "Captcha", `Captcha Detected!!!`);
            logger.warn("Bot", "Captcha", `Bot Paused: ${client.global.paused}`);

            if (message.guild && message.guild.id === client.config.captcha?.server_id) {
                try {
                    await client.queueSend(message.channel, {});
                } catch (error) {
                    logger.warn("Bot", "Captcha", `Failed to ping @everyone: ${error.message}`);
                }
            }

            client.notifier.notify({
                title: "Captcha Detected!",
                message: `Solve the captcha and type ${client.config.prefix}resume in farm channel`,
                icon: "./assets/captcha.png",
                sound: true,
                wait: true,
                appID: "EpicRPG Farm Bot",
            });

            client.emit('captchaDetected', message);
        }

        // --- KHỐI LỆNH NHẬN DIỆN GIẢI THÀNH CÔNG (ĐÃ SỬA) ---
        if (
            msgcontent.includes("**epic guard**: everything seems fine") ||
            msgcontent.includes("**epic guard**: fine, i will let you go")
        ) {
            if (client.global.captchadetected) {
                logger.info("Farm", "Captcha", "Phát hiện tin nhắn giải CAPTCHA thành công!");
                client.global.captchadetected = false;
            }
        }
    }

    //*Training River
    if (
        msgcontent.includes("is training in the river!") &&
        client.config.commands.experience.training
    ) {
        client.global.paused = true;
        let fishnumber;

        if (msgcontent.includes("<:epicfish:543182761431793715>")) {
            fishnumber = "3";
        } else if (
            msgcontent.includes("<:goldenfish:697940429500317727>")
        ) {
            fishnumber = "2";
        } else if (
            msgcontent.includes("<:normiefish:697940429999439872>")
        ) {
            fishnumber = "1";
        }

        logger.info("Farm", "Training", `River Fish Number: ${fishnumber}`);
        try {
            let riveranswer;
            if (fishnumber === "1") {
                riveranswer = "normie fish";
            } else if (fishnumber === "2") {
                riveranswer = "golden fish";
            } else if (fishnumber === "3") {
                riveranswer = "EPIC fish";
            }
            let rivertrainingbutton = message.components[0].components.find(
                (button) => button.label.toLowerCase() === `${riveranswer}`
            );
            if (rivertrainingbutton) {
                await message.clickButton(rivertrainingbutton.customId);
                logger.info(
                    "Farm",
                    "Training",
                    `River training completed with clicking button`
                );
            } else {
                logger.warn("Farm", "Training", `River Button Not Found - Answer: ${riveranswer}`);
                await client.queueSend(message.channel, { content: fishnumber });
                logger.info("Farm", "Training", `River training completed with writing: ${fishnumber}`);
            }
        } catch (error) {
            await client.queueSend(message.channel, {
                content: fishnumber,
            });
            logger.info(
                "Farm",
                "Training",
                `River training completed with writing`
            );
        }

        client.global.paused = false;
    }

    //*Training Casino
    if (
        msgcontent.includes("is training in the... casino?") &&
        client.config.commands.experience.training
    ) {
        client.global.paused = true;
        let casinoanswer;

        const itemRegex = /is this a \*\*(.+?)\*\* \?/;
        const emojiRegex1 = /<:\w+:\d+>/;
        const emojiRegex2 = /:\w+:/;

        const itemMatch = msgcontent.match(itemRegex);
        const emojiMatch1 = msgcontent.match(emojiRegex1);
        const emojiMatch2 = msgcontent.match(emojiRegex2);

        if (itemMatch && (emojiMatch1 || emojiMatch2)) {
            const item = itemMatch[1];
            const emoji = emojiMatch1 ? emojiMatch1[0] : emojiMatch2[0];

            if (
                (item === "four leaf clover" &&
                    emoji === ":four_leaf_clover:") ||
                (item === "diamond" && emoji === ":gem:") ||
                (item === "gold" && emoji === ":gold:") ||
                (item === "gift" && emoji === ":gift:") ||
                (item === "coin" &&
                    emoji === "<:coin:541384484201693185>") ||
                (item === "dice" && emoji === ":game_die:")
            ) {
                casinoanswer = "yes";
            } else {
                casinoanswer = "no";
            }
        }

        logger.info("Farm", "Training", `Casino Answer: ${casinoanswer}`);
        try {
            let casinotrainingbutton =
                message.components[0].components.find(
                    (button) =>
                        button.label.toLowerCase() === `${casinoanswer}`
                );
            if (casinotrainingbutton) {
                await message.clickButton(casinotrainingbutton.customId);
                logger.info(
                    "Farm",
                    "Training",
                    `Casino training completed with clicking button`
                );
            } else {
                logger.warn("Farm", "Training", `Casino Button Not Found - Answer: ${casinoanswer}`);
                await client.queueSend(message.channel, { content: casinoanswer });
                logger.info("Farm", "Training", `Casino training completed with writing: ${casinoanswer}`);
            }
        } catch (error) {
            await client.queueSend(message.channel, { content: casinoanswer });
            logger.info(
                "Farm",
                "Training",
                `Casino training completed with writing`
            );
        }
        client.global.paused = false;
    }

    //*Training Forest
    if (
        msgcontent.includes("is training in the forest!") &&
        client.config.commands.experience.training
    ) {
        let forestcount;
        let foresttrainingbutton;
        const emojiRegex = /how many\s([^ ]+)\sdo you see\?/;
        const emojiMatch = msgcontent.match(emojiRegex);

        if (emojiMatch) {
            const emoji = emojiMatch[1].trim();

            const emojiCount = (
                msgcontent.match(new RegExp(emoji, "g")) || []
            ).length;

            forestcount = emojiCount - 1;
        }
        foresttrainingbutton = message.components[0].components.find(
            (button) => button.label.toLowerCase() === `${forestcount}`
        );
        try {
            if (foresttrainingbutton) {
                await message.clickButton(foresttrainingbutton.customId);
                logger.info("Farm", "Training", `Clicked ${forestcount} Forest Button`);
            } else {
                logger.warn("Farm", "Training", `Forest Button Not Found - Answer: ${forestcount}`);
                await client.queueSend(message.channel, { content: forestcount.toString() });
                logger.info("Farm", "Training", `Forest training completed with writing: ${forestcount}`);
            }
        } catch (error) {
            foresttrainingbutton = message.components[1].components.find(
                (button) => button.label.toLowerCase() === `${forestcount}`
            );
            if (foresttrainingbutton) {
                await message.clickButton(foresttrainingbutton.customId);
                logger.info("Farm", "Training", `Clicked ${forestcount} Forest Button (fallback)`);
            } else {
                logger.warn("Farm", "Training", `Forest Button Not Found - Answer: ${forestcount}`);
                await client.queueSend(message.channel, { content: forestcount.toString() });
                logger.info("Farm", "Training", `Forest training completed with writing: ${forestcount}`);
            }
        }
    }

    //*Training The Field
    if (
        msgcontent.includes("is training in the field!") &&
        client.config.commands.experience.training
    ) {
        let fieldanswer;
        let fieldtrainingbutton;
        const itemRegex = /what's the \*\*(.+?)\*\* letter of/;
        const emojiRegex = /<:(\w+):/;

        const itemMatch = msgcontent.match(itemRegex);
        const emojiMatch = msgcontent.match(emojiRegex);

        if (itemMatch && emojiMatch) {
            const item = itemMatch[1];
            let itemint;
            const emojiName = emojiMatch[1];

            switch (item) {
                case "first":
                    itemint = 1;
                    break;
                case "second":
                    itemint = 2;
                    break;
                case "third":
                    itemint = 3;
                    break;
                case "fourth":
                    itemint = 4;
                    break;
                case "fifth":
                    itemint = 5;
                    break;
                case "sixth":
                    itemint = 6;
                    break;
                default:
                    break;
            }
            const letterIndex = parseInt(itemint) - 1;
            fieldanswer = emojiName[letterIndex];
        }
        let newfieldanswer;

        switch (fieldanswer) {
            case "a":
                newfieldanswer = "training_a";
                break;
            case "b":
                newfieldanswer = "training_b";
                break;
            case "e":
                newfieldanswer = "training_e";
                break;
            case "l":
                newfieldanswer = "training_l";
                break;
            case "n":
                newfieldanswer = "training_n";
                break;
            case "p":
                newfieldanswer = "training_p";
                break;
            default:
                break;
        }

        fieldtrainingbutton = message.components[0].components.find(
            (button) =>
                button.customId.toLowerCase() === `${newfieldanswer}`
        );

        try {
            if (fieldtrainingbutton) {
                await message.clickButton(fieldtrainingbutton.customId);
                logger.info("Farm", "Training", `Clicked ${fieldanswer} Field Button`);
            } else {
                logger.warn("Farm", "Training", `Field Button Not Found - Answer: ${fieldanswer}`);
                await client.queueSend(message.channel, { content: fieldanswer });
                logger.info("Farm", "Training", `Field training completed with writing: ${fieldanswer}`);
            }
        } catch (error) {
            fieldtrainingbutton = message.components[1].components.find(
                (button) =>
                    button.customId.toLowerCase() === `${newfieldanswer}`
            );
            if (fieldtrainingbutton) {
                await message.clickButton(fieldtrainingbutton.customId);
                logger.info("Farm", "Training", `Clicked ${fieldanswer} Field Button (fallback)`);
            } else {
                logger.warn("Farm", "Training", `Field Button Not Found - Answer: ${fieldanswer}`);
                await client.queueSend(message.channel, { content: fieldanswer });
                logger.info("Farm", "Training", `Field training completed with writing: ${fieldanswer}`);
            }
        }
    }

    // Working results (plain text) ruby gain tracker
    try {
        const raw = message.content || "";
        const rubyNumberMatch = raw.match(/one of them had\s+(\d+)\s+<:[^>]+:\d+>\s*rub(?:y|ies)/i) ||
            raw.match(/omg!!\s+.*?\s+got\s+(\d+)\s+<:[^>]+:\d+>\s*rub(?:y|ies)/i);
        if (rubyNumberMatch) {
            const gained = parseInt(rubyNumberMatch[1], 10) || 0;
            if (gained > 0) {
                const oldCount = client.global.inventory.rubies || 0;
                client.global.inventory.rubies = oldCount + gained;
                logger.info("Farm", "Tracker", `Rubies: ${oldCount} → ${client.global.inventory.rubies} (+${gained})`);
            }
        }
    } catch (e) {}

    // Boss fight ruby gain tracker
    try {
        const raw = message.content || "";
        const bossFightMatch = raw.match(/\*\*([^*]+)\*\*\s+fights\s+\*\*([^*]+)\*\*/i);
        const bossRewardMatch = raw.match(/\*\*([^*]+)\*\*\s+got\s+(\d+)\s+<:[^>]+:\d+>\s*\*\*ruby\*\*/i);
        if (bossFightMatch && bossRewardMatch) {
            const player = bossFightMatch[1];
            const boss = bossFightMatch[2];
            const rubyGained = parseInt(bossRewardMatch[2], 10) || 0;
            if (rubyGained > 0) {
                const oldCount = client.global.inventory.rubies || 0;
                client.global.inventory.rubies = oldCount + rubyGained;
                logger.info("Farm", "Boss Fight", `🎯 ${player} defeated ${boss} and got ${rubyGained} rubies!`);
                logger.info("Farm", "Tracker", `Rubies: ${oldCount} → ${client.global.inventory.rubies} (+${rubyGained})`);
            }
        }
    } catch (e) {}

    // Auto fight Ruby Dragon boss
    try {
        if (message.embeds && message.embeds.length > 0) {
            const embed = message.embeds[0];
            const description = embed.description || "";
            const fields = embed.fields || [];
            if (description.includes("THE RUBY DRAGON") && description.includes("JUST SPAWNED IN FRONT OF YOU")) {
                const authorName = embed.author ? embed.author.name : "";
                const botUsername = client.user.username;
                if (authorName.includes(botUsername) || authorName.includes(client.config.userid)) {
                    logger.info("Farm", "Boss Fight", "🐉 Ruby Dragon detected! Auto-fighting...");
                    await client.queueSend(message.channel, { content: "fight" });
                    logger.info("Farm", "Boss Fight", "⚔️ Auto-selected fight option for Ruby Dragon");
                }
            }
        }
    } catch (e) {
        logger.warn("Farm", "Boss Fight", `Auto-fight failed: ${e.message}`);
    }

    //*Training Mine (rubies yes/no)
    if (
        msgcontent.includes("is training in the mine!") &&
        client.config.commands.experience.training
    ) {
        client.global.paused = true;
        try {
            const thresholdMatch = msgcontent.match(/more than\s+(\d+)/);
            const threshold = thresholdMatch ? parseInt(thresholdMatch[1], 10) : null;
            const currentRubies = client.global.inventory.rubies || 0;
            const answer = threshold !== null && currentRubies > threshold ? "yes" : "no";
            logger.info("Farm", "Training", `Mine check: have ${currentRubies} rubies, threshold ${threshold} -> ${answer}`);
            try {
                const btn = message.components[0].components.find(
                    (b) => b.label.toLowerCase() === answer
                );
                if (btn) {
                    await message.clickButton(btn.customId);
                    logger.info("Farm", "Training", `Mine training answered with ${answer} (button)`);
                } else {
                    logger.warn("Farm", "Training", `Mine Button Not Found - Answer: ${answer}`);
                    await client.queueSend(message.channel, { content: answer });
                    logger.info("Farm", "Training", `Mine training answered with ${answer} (text)`);
                }
            } catch (err) {
                await client.queueSend(message.channel, { content: answer });
                logger.info("Farm", "Training", `Mine training answered with ${answer} (fallback)`);
            }
        } catch (e) {
            logger.warn("Farm", "Training", `Mine training auto-answer failed: ${e}`);
        }
        client.global.paused = false;
    }

    if (
        Array.isArray(message.embeds) &&
        message.embeds.length > 0 &&
        message.embeds[0] &&
        message.embeds[0].type
    ) {
        // Auto-tame pet after training: advanced algorithm based on Python code
        try {
            const embed = message.embeds[0] || {};
            const desc = (embed.description || "").toLowerCase();
            const fld0 = embed.fields && embed.fields[0] ? embed.fields[0] : null;
            const nameText = (fld0 && fld0.name ? String(fld0.name) : "").toLowerCase();
            const valueText = (fld0 && fld0.value ? String(fld0.value) : "").toLowerCase();
            const combined = `${nameText}\n${valueText}\n${desc}`;
            const hasPet = /suddenly\s*,?\s*a\s+.*\s+is\s+approaching/i.test(combined) ||
                /suddenly\s*,?\s*a\s+.*\s+tier\s+.*\s+is\s+approaching/i.test(combined) ||
                (nameText.includes('suddenly') && valueText.includes('happiness'));
            if (hasPet) {
                client.global.paused = true;
                logger.info("Farm", "Pet", "Pet detected! Starting advanced auto-tame sequence...");
                let happiness = 0;
                let hunger = 0;
                const happinessPatterns = [
                    /happiness[^\d]{0,10}(\d{1,3})/i,
                    /\*\*happiness\*\*[^\d]{0,10}(\d{1,3})/i,
                    /felicidad[^\d]{0,10}(\d{1,3})/i,
                    /felicidade[^\d]{0,10}(\d{1,3})/i
                ];
                for (const pattern of happinessPatterns) {
                    const match = valueText.match(pattern);
                    if (match) {
                        happiness = parseInt(match[1], 10) || 0;
                        break;
                    }
                }
                const hungerPatterns = [
                    /hunger[^\d]{0,10}(\d{1,3})/i,
                    /\*\*hunger\*\*[^\d]{0,10}(\d{1,3})/i,
                    /hambre[^\d]{0,10}(\d{1,3})/i,
                    /fome[^\d]{0,10}(\d{1,3})/i
                ];
                for (const pattern of hungerPatterns) {
                    const match = valueText.match(pattern);
                    if (match) {
                        hunger = parseInt(match[1], 10) || 0;
                        break;
                    }
                }
                if (happiness === 0 && hunger === 0) {
                    logger.warn("Farm", "Pet", "Could not parse pet stats, using fallback");
                    client.global.paused = false;
                    return;
                }
                logger.info("Farm", "Pet", `Pet stats - Happiness: ${happiness}, Hunger: ${hunger}`);
                function calculatePetSequence(happiness, hunger) {
                    let feedsLow, patsLow;
                    let hungerRest = hunger % 18;
                    if (hungerRest >= 9) {
                        feedsLow = Math.floor(hunger / 18) + 1;
                        hungerRest = 0;
                    } else {
                        feedsLow = Math.floor(hunger / 18);
                    }
                    let happinessMissing = (hungerRest + 85) - happiness;
                    let happinessRest = happinessMissing % 8;
                    if (happinessRest > 0) {
                        patsLow = Math.floor(happinessMissing / 8) + 1;
                    } else {
                        patsLow = Math.floor(happinessMissing / 8);
                    }
                    if (feedsLow + patsLow > 6) {
                        patsLow = 6 - feedsLow;
                    }
                    let feedsHigh, patsHigh;
                    hungerRest = hunger % 22;
                    if (hungerRest >= 9) {
                        feedsHigh = Math.floor(hunger / 22) + 1;
                        hungerRest = 0;
                    } else {
                        feedsHigh = Math.floor(hunger / 22);
                    }
                    happinessMissing = (hungerRest + 85) - happiness;
                    happinessRest = happinessMissing % 12;
                    if (happinessRest > 0) {
                        patsHigh = Math.floor(happinessMissing / 12) + 1;
                    } else {
                        patsHigh = Math.floor(happinessMissing / 12);
                    }
                    if (feedsHigh + patsHigh > 6) {
                        patsHigh = 6 - feedsHigh - 1;
                    }
                    if (patsHigh < 0) patsHigh = 0;
                    const totalLow = feedsLow + patsLow;
                    const totalHigh = feedsHigh + patsHigh;
                    if (totalLow === totalHigh) {
                        patsHigh = Math.max(0, patsHigh - 1);
                    }
                    if (totalLow <= totalHigh + 1) {
                        return { feeds: feedsLow, pats: patsLow, strategy: 'low_risk' };
                    } else {
                        return { feeds: feedsHigh, pats: patsHigh, strategy: 'high_risk' };
                    }
                }
                const result = calculatePetSequence(happiness, hunger);
                const { feeds, pats, strategy } = result;
                logger.info("Farm", "Pet", `Strategy: ${strategy}, Feeds: ${feeds}, Pats: ${pats}`);
                const hungerRemainingMin = Math.max(0, hunger - (feeds * 22));
                const hungerRemainingMax = Math.max(0, hunger - (feeds * 18));
                const happinessRemainingMin = Math.max(0, happiness + (pats * 8));
                const happinessRemainingMax = Math.max(0, happiness + (pats * 12));
                const differenceBest = happinessRemainingMax - hungerRemainingMin;
                const differenceWorst = happinessRemainingMin - hungerRemainingMax;
                const chanceMin = Math.min(100, (100 / 85) * differenceWorst);
                const chanceMax = Math.min(100, (100 / 85) * differenceBest);
                logger.info("Farm", "Pet", `Catch chance: ${chanceMin.toFixed(2)}% - ${chanceMax.toFixed(2)}%`);
                const sequence = [];
                for (let i = 0; i < pats; i++) {
                    sequence.push("pat");
                }
                for (let i = 0; i < feeds; i++) {
                    sequence.push("feed");
                }
                if (sequence.length === 0) {
                    logger.info("Farm", "Pet", "No actions needed, pet already has high gap");
                } else {
                    logger.info("Farm", "Pet", `Command sequence: ${sequence.join(", ")}`);
                }
                let commandMessage = sequence.join(" ");
                try {
                    await client.queueSend(message.channel, { content: commandMessage });
                    logger.info("Farm", "Pet", `Sent: ${commandMessage}`);
                } catch (e) {
                    logger.warn("Farm", "Pet", `Failed to send pet commands: ${e.message}`);
                }
                client.global.paused = false;
                logger.info("Farm", "Pet", "Advanced pet auto-tame sequence completed");
            }
        } catch (e) {
            logger.warn("Farm", "Pet", `Pet detection failed: ${e.message}`);
            client.global.paused = false;
        }

        if (client.config.settings.event.autojoin) {
            if (
                message.embeds[0] &&
                Array.isArray(message.embeds[0].fields) &&
                message.embeds[0].fields.length > 0 &&
                message.embeds[0].fields[0] &&
                message.embeds[0].fields[0].name
            ) {
                let event = message.embeds[0].fields[0].name;
                if (
                    event.toLowerCase().includes("an epic tree has just grown")
                ) {
                    await message.clickButton();
                    client.global.totalevent = client.global.totalevent + 1;
                    logger.info("Event", "Epic Tree", "Joined");
                }
                if (
                    event
                        .toLowerCase()
                        .includes("a megalodon has spawned in the river")
                ) {
                    await message.clickButton();
                    client.global.totalevent = client.global.totalevent + 1;
                    logger.info("Event", "Megalodon", "Joined");
                }
                if (event.toLowerCase().includes("it's raining coins")) {
                    await message.clickButton();
                    client.global.totalevent = client.global.totalevent + 1;
                    logger.info("Event", "Raining Coin", "Joined");
                }
                if (event.toLowerCase().includes("god accidentally dropped")) {
                    await message.clickButton();
                    client.global.totalevent = client.global.totalevent + 1;
                    logger.info("Event", "GOD Coin", "Joined");
                }
            }
        }
        if (client.config.settings.event.autospecialtrade) {
            if (
                message.embeds[0] &&
                Array.isArray(message.embeds[0].fields) &&
                message.embeds[0].fields.length > 0 &&
                message.embeds[0].fields[0] &&
                message.embeds[0].fields[0].name
            ) {
                let specialtrade = message.embeds[0].fields[0].name;
                if (
                    specialtrade
                        .toLowerCase()
                        .includes("i have a special trade today!")
                ) {
                    try {
                        const fieldValue = (message.embeds[0].fields[0].value || "");
                        let phrase = null;
                        const boldMatch = fieldValue.match(/\*\*(.+?)\*\*/);
                        if (boldMatch && boldMatch[1]) {
                            phrase = boldMatch[1].trim();
                        } else {
                            phrase = fieldValue
                                .split("\n")
                                .map((l) => l.trim())
                                .filter((l) => l.length > 0)
                                .pop() || null;
                        }
                        if (phrase) {
                            await client.queueSend(message.channel, { content: phrase });
                            client.global.totalspecialtrade =
                                client.global.totalspecialtrade + 1;
                            logger.info("Event", "Special Trade", `Typed phrase: ${phrase}`);
                        } else {
                            logger.warn("Event", "Special Trade", "Phrase not found in embed fields value");
                        }
                    } catch (e) {
                        logger.warn("Event", "Special Trade", `Auto-accept failed: ${e}`);
                    }
                }
            }
        }

        // Handle "nothing" scenario - automatically choose move
        try {
            const embed = message.embeds[0] || {};
            const description = embed.description || "";
            if (description.includes("there is **nothing**") && description.includes("What will you do?")) {
                logger.info("Farm", "Working", "Nothing found in area, automatically choosing 'move'");
                await client.queueSend(message.channel, { content: "move" });
                logger.info("Farm", "Working", "Sent 'move' command to find items in another area");
            }
        } catch (e) {
            logger.warn("Farm", "Working", `Auto-move detection failed: ${e.message}`);
        }

        if (client.config.settings.event.autoarena) {
            if (
                message.embeds[0] &&
                Array.isArray(message.embeds[0].fields) &&
                message.embeds[0].fields.length > 0 &&
                message.embeds[0].fields[0] &&
                message.embeds[0].fields[0].name
            ) {
                let arena = message.embeds[0].fields[0].name;
                if (arena.toLowerCase().includes("to join the arena!")) {
                    await message.clickButton();
                    client.global.totalarena = client.global.totalarena + 1;
                    logger.info("Event", "Arena", "Accepted");
                }
            }
        }
    }

    /**
     * CMD
     */
    let PREFIX = client.config.prefix;
    if (client.config.captcha?.captcha_prefix && message.content.startsWith(client.config.captcha.captcha_prefix)) {
        const captchaInput = message.content.slice(client.config.captcha.captcha_prefix.length).trim();
        if (captchaInput) {
            logger.info("Bot", "Captcha", `📝 User ${message.author.username} (${message.author.id}) provided captcha input: "${captchaInput}"`);
            try {
                await client.queueSend(message.channel, { content: captchaInput });
                logger.info("Bot", "Captcha", `✅ Sent captcha input: "${captchaInput}"`);
            } catch (error) {
                logger.warn("Bot", "Captcha", `Failed to send captcha input: ${error.message}`);
            }
        }
        return;
    }

    const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const prefixRegex = new RegExp(
        `^(<@!?${client.user.id}>|${escapeRegex(PREFIX)})\\s*`
    );
    if (!prefixRegex.test(message.content)) return;
    const [matchedPrefix] = message.content.match(prefixRegex);
    const args = message.content
        .slice(matchedPrefix.length)
        .trim()
        .split(/ +/g);
    const command = args.shift().toLowerCase();

    const cmd =
        client.commands.get(command) ||
        client.commands.get(client.aliases.get(command));

    if (cmd) {
        if (message.author.id !== client.config.userid) return;
        cmd.run(client, message, args);
    }
};