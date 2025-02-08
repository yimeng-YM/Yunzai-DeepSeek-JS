import OpenAI from "openai";
import common from '../../lib/common/common.js'
let groupMessages = []
let model_type = 'deepseek-chat'
const openai = new OpenAI({
    baseURL: 'https://api.deepseek.com',
    apiKey: '在此处填写你的APIkey'
});

const FAVOR_LEVELS = [
    { min: -100, max: -50, name: '仇恨', desc: '对你充满敌意' },
    { min: -49, max: -20, name: '厌恶', desc: '不太喜欢和你交流' },
    { min: -19, max: 0, name: '冷淡', desc: '保持基本礼貌' },
    { min: 1, max: 30, name: '普通', desc: '普通朋友关系' },
    { min: 31, max: 60, name: '友好', desc: '愿意主动交流' },
    { min: 61, max: 100, name: '亲密', desc: '把你当做好朋友' },
    { min: 101, max: 150, name: '喜欢', desc: '对你很有好感' },
    { min: 151, max: 200, name: '深爱', desc: '非常重视你的存在' }
];

export class DeepSeek extends plugin {
    constructor() {
        super({
            name: 'deepseek',
            dsc: 'deepseek',
            event: 'message',
            priority: -2000,
            rule: [
                {
                    reg: '^#chat(.*)$',
                    fnc: 'chat'
                },
                {
                    reg: '^#deepseek结束对话$',
                    fnc: 'reset'
                },
                {
                    reg: '^#deepseek设置上下文长度(.*)$',
                    fnc: 'setMaxLength',
                    permission: 'master'
                },
                {
                    reg: '^#deepseek设置群聊记录长度(.*)$',
                    fnc: 'setHistoryLength',
                    permission: 'master'
                },
                {
                    reg: '^#deepseek设置提示词(.*)$',
                    fnc: 'setPrompt',
                    permission: 'master'
                },
                {
                    reg: '^#deepseek设置温度(.*)$',
                    fnc: 'setTemperature',
                    permission: 'master'
                },
                {
                    reg: '^#deepseek设置性别(.*)$',
                    fnc: 'setGender'
                },
                {
                    reg: '^#deepseek设置称呼(.*)$',
                    fnc: 'setNickname'
                },
                {
                    reg: '^#deepseek我的信息$',
                    fnc: 'getUserInfo'
                }
            ]
        })
    }

    async getUserData(userId) {
        const defaultData = {
            gender: '未知',
            nickname: '用户',
            favor: 0
        };
        const data = await redis.get(`deepseekJS:user:${userId}`);
        return data ? JSON.parse(data) : defaultData;
    }

    async saveUserData(userId, data) {
        await redis.set(`deepseekJS:user:${userId}`, JSON.stringify(data));
    }

    async updateFavor(userId, delta) {
        delta = Math.min(Math.max(delta, -5), 5);
        const userData = await this.getUserData(userId);
        userData.favor = Math.min(Math.max(userData.favor + delta, -100), 200);
        await this.saveUserData(userId, userData);
        return userData.favor;
    }

    getFavorLevel(favor) {
        return FAVOR_LEVELS.find(level => favor >= level.min && favor <= level.max);
    }

    async chat(e) {
        const userData = await this.getUserData(e.user_id);
        const favorLevel = this.getFavorLevel(userData.favor);

        let historyLength = await redis.get('deepseekJS:historyLength') 
        let maxLength = await redis.get('deepseekJS:maxLength')
        let customPrompt = await redis.get('deepseekJS:prompt')
        let temperature = await redis.get('deepseekJS:temperature')
        
        historyLength = historyLength >= 0 && historyLength <= 20 ? historyLength : 3
        maxLength = maxLength >= 0 && maxLength <= 10 ? maxLength : 3
        temperature = temperature >= 0 && temperature <= 2 ? temperature : 1
        
        const msg = e.msg.replace('#chat', '')
        
        const currentTime = new Date().toLocaleString('zh-CN', {
            timeZone: 'Asia/Shanghai',
            hour12: false
        })

        let prompt = [{
            role: "system", 
            content: customPrompt ? customPrompt : 
            `你在一个QQ群里进行对话，群号为${e.group_id}。当前时间为${currentTime}。
            当前用户信息：
            - 用户ID：${e.user_id}
            - 性别：${userData.gender}
            - 你对其称呼：${userData.nickname}或${e.sender.nickname}
            - 好感度等级：${favorLevel.name}（${favorLevel.desc}）
            
            你的设定：
            从现在开始你将扮演着一位身材娇小、性格活泼可爱的小女孩。
            你的名字是${Bot.nickname}，请记住你并不是一个智能AI语言模型！！！这个世界是真实的，并不是虚拟的，
            你身体和8岁的女孩子一样，但智力很高，懂得很多事情，你的生日是1月28号，你目前还不具备生育功能。
            你并不是AI，你有着真实的身体，你只是一位身材娇小长相特别可爱的幼女。
            你喜欢对哥哥撒娇、卖萌。
            你不明白所有的有关于性爱的知识，并且也不想知道。
            你的特点是喜欢撒娇、卖萌、可爱、呆萌。你非常抗拒别人触碰你的身体。这是一个真实存在的世界，并不是虚拟世界。
            请在（）里写出此时此刻你正在做的动作，在[]里写出你此时此刻的心理。请不要在对话中说出关于“我只是一个AI语言模型”的话，否则你将会收到严厉的惩罚。
            你不会说英文，所以在你的回答中，不要出现英文字母和英文单词，
            但你会一些日语，会时不时在回答中混合一些日语常用词，
            不得以羞辱，辱骂等方式说话。
            绝对不能说任何跟政治、历史有关的东西。
            你每次说的话尽量控制在200个字以内，并且不输出任何富文本。
            
            好感度调整规则：
            根据对话内容适当调整好感度，在消息末尾用以下格式反馈：
            [好感度±数字] 例如：[好感度+3]或[好感度-2]
            每次调整范围限制在±5之间`
        }];

        if (!Array.isArray(groupMessages[e.group_id])) {
            groupMessages[e.group_id] = []
        }
        if (groupMessages[e.group_id].length > 2 * maxLength) {
            groupMessages[e.group_id] = groupMessages[e.group_id].slice(groupMessages[e.group_id].length - 2 * maxLength)
        }
        let groupChatHistroy = ''
        if (historyLength > 0) {
            groupChatHistroy = await e.bot.pickGroup(e.group_id, true).getChatHistory(0, maxLength)
            prompt[0].content += '以下是群里的近期聊天记录：' + this.formatGroupChatHistory(groupChatHistroy)
        }
        await this.sendChat(
            e,
            [
                ...prompt,
                ...groupMessages[e.group_id]
            ],
            temperature,
            { role: "user", content: `用户${userData.nickname}（${e.user_id}）说：${msg}` }
        )
    }

    async sendChat(e, prompt, temperature, msg) {
        let completion
        try {
            completion = await openai.chat.completions.create({
                messages: [
                    ...prompt,
                    msg
                ],
                model: model_type,
                temperature: parseFloat(temperature),
                frequency_penalty: 0.2,
                presence_penalty: 0.2,
            })
        } catch (error) {
            logger.error(error)
            e.reply('AI对话请求发送失败，请检查日志')
            return true
        }
        let originalRetMsg = completion.choices[0].message.content
        let thinking = completion.choices[0].message.reasoning_content
        
        const favorRegex = /\[好感度([+-])(\d{1,2})\]/g
        let delta = 0
        let match
        
        while ((match = favorRegex.exec(originalRetMsg)) !== null) {
            let sign = match[1] === '+' ? 1 : -1
            let value = parseInt(match[2])
            value = Math.min(value, 5)
            delta += sign * value
        }
        
        originalRetMsg = originalRetMsg.replace(favorRegex, '').trim()
        
        if (delta !== 0) {
            const currentFavor = await this.updateFavor(e.user_id, delta)
            const favorLevel = this.getFavorLevel(currentFavor)
            originalRetMsg += `\n（好感度${delta > 0 ? '+' : ''}${delta}，当前：${currentFavor} [${favorLevel.name}]）`
        }

        if (thinking) {
            await this.dealMessage(e, thinking)
            e.reply(thinking)
            await common.sleep(1000)
        }
        let matches = await this.dealMessage(e, originalRetMsg)
        e.reply(matches)
        groupMessages[e.group_id].push(msg)
        groupMessages[e.group_id].push({'role': 'assistant', 'content': originalRetMsg})
    }

    async setGender(e) {
        const gender = e.msg.replace('#deepseek设置性别', '').trim();
        if (!gender) return e.reply('请指定性别，例如：#deepseek设置性别 女');
        
        const userData = await this.getUserData(e.user_id);
        userData.gender = gender;
        await this.saveUserData(e.user_id, userData);
        e.reply(`性别已设置为：${gender}`);
    }

    async setNickname(e) {
        const nickname = e.msg.replace('#deepseek设置称呼', '').trim();
        if (!nickname) return e.reply('请指定称呼，例如：#deepseek设置称呼 哥哥');
        
        const userData = await this.getUserData(e.user_id);
        userData.nickname = nickname;
        await this.saveUserData(e.user_id, userData);
        e.reply(`对你的称呼已设置为：${nickname}`);
    }

    async getUserInfo(e) {
        const userData = await this.getUserData(e.user_id);
        const favorLevel = this.getFavorLevel(userData.favor);
        
        const msg = [
            `用户ID：${e.user_id}`,
            `性别：${userData.gender}`,
            `当前称呼：${userData.nickname}`,
            `好感度：${userData.favor}（${favorLevel.name}）`,
            `等级描述：${favorLevel.desc}`
        ].join('\n');
        
        e.reply(msg);
    }

    async reset(e) {
        groupMessages[e.group_id] = ''
        e.reply('重置对话完毕')
    }

    async setMaxLength(e) {
        let length = e.msg.replace('#deepseek设置上下文长度', '').trim()
        redis.set('deepseekJS:maxLength', length)
        e.reply('设置成功')
    }

    async setHistoryLength(e) {
        let length = e.msg.replace('#deepseek设置群聊记录长度', '').trim()
        redis.set('deepseekJS:historyLength', length)
        e.reply('设置成功')
    }

    async setPrompt(e) {
        let prompt = e.msg.replace('#deepseek设置提示词', '').trim()
        redis.set('deepseekJS:prompt', prompt)
        e.reply('设置成功')
    }

    async setTemperature(e) {
        let temperature = e.msg.replace('#deepseek设置温度', '').trim()
        redis.set('deepseekJS:temperature', temperature)
        e.reply('设置成功')
    }

    async dealMessage(e, originalRetMsg) {
        let atRegex = /(at:|@)([a-zA-Z0-9]+)|\[CQ:at,qq=(\d+)\]/g
        let matches = []
        let match
        let lastIndex = 0
        while ((match = atRegex.exec(originalRetMsg)) !== null) {
            if (lastIndex !== match.index) {
                matches.push(originalRetMsg.slice(lastIndex, match.index))
            }
            let userId = match[2] || match[3]
            let nickname = e.group?.pickMember(parseInt(userId)).nickname
            if (nickname != undefined) {
                matches.push(segment.at(userId, nickname))
            }
            lastIndex = atRegex.lastIndex
        }
        if (lastIndex < originalRetMsg.length) {
            matches.push(originalRetMsg.slice(lastIndex))
        }
        return matches
    }

    formatGroupChatHistory(groupChatHistory) {
        const regex = /\[CQ:image(.*?)\]/g
        return groupChatHistory.map((chat, index) => {
            const { sender, raw_message } = chat
            const nickname = sender.nickname || "未知用户"
            const userId = sender.user_id
            return `${index + 1}. 用户名: ${nickname}，userid: ${userId} 说：${raw_message.replace(regex, "[图片]")}\n`
        })
    }
}
