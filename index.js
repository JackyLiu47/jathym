const Discord = require('discord.js');
const{
    prefix,
    token,
} = require('./config.json');
const ytdl = require('ytdl-core')

//connect to the discord bot
const client = new Discord.Client();
const queue = new Map();

//console
client.once('ready',() => {
    console.log('Ready!');
});
client.once('reconnecting',() => {
    console.log('reconnecting!');
});
client.once('disconnect',() => {
    console.log('disconnect!');
});

//get commands from text channel
client.on('message', async message => {
    if (message.author.bot) return;
    if (!message.content.startsWith(prefix)) return;

    const serverQueue = queue.get(message.guild.id)

    if(message.content.startsWith(`${prefix}play`)) {
        execute(message,serverQueue);
        return;
    }
    else if (message.content.startsWith(`${prefix}skip`)){
        skip(message, serverQueue);
        return;
    }
    else if (message.content.startsWith(`${prefix}stop`)){
        stop(message, serverQueue);
        return;
    }
    /*else if (message.content.startsWith(`${prefix}leave`)){
        leave(message, serverQueue);
    }*/
    else {
        message.channel.send("You need to enter a valid command!");
    }
});


//check user status and permissions
async function execute(message, serverQueue){
    const args = message.content.split(" ");

    const voiceChannel = message.member.voice.channel;
    if(!voiceChannel)
        return message.channel.send(
            "You are not in the voice channel! 您不在频道中！"
        );
    const permissions = voiceChannel.permissionsFor(message.client.user);
    if(!permissions.has("CONNECT") || !permissions.has("SPEAK")) {
        return message.channel.send(
            "I need permissions to join and speak in the channel! 我需要加入和在当前频道说话的权限！"
        );
    }

    //use ytdl to get songinfo and save in song object
    const songInfo = await ytdl.getInfo(args[1])
    const song = {
        title: songInfo.title,
        url: songInfo.video_url,
    };

    //add songs into queue if queue exist
    if (!serverQueue) {
        //create a queue contruct
        const queuecontruct = {
            textChannel: message.channel,
            voiceChannel:voiceChannel,
            connection: null,
            songs:[],
            volume: 5,
            playing: true,
        };
        //use the contruct
        queue.set(message.guild.id, queuecontruct);
        // Pushing the songs into the queue
        queuecontruct.songs.push(song);

        try{
            //try join the voicechannel and save connection into the object
            var connection = await voiceChannel.join();
            queuecontruct.connection = connection;
            play(message.guild, queuecontruct.songs[0]);
        }
        catch(err) {
            console.log(err);
            queue.delete(message.guild.id);
            return message.channel.send(err);
        }
    } else {
        serverQueue.songs.push(song);
        console.log(serverQueue.songs);
        return message.channel.send(`${song.title} has been added to the queue!`);
        }
}
//create a play function
function play(guild, song) {
    const serverQueue = queue.get(guild.id);
    if(!song) {
        serverQueue.voiceChannel.leave();
        queue.delete(guild.id);
        return;
    }

    //create a stream and pass the song's url to it, also create listeners to check finish and error
    const dispatcher = serverQueue.connection
        .play(ytdl(song.url))
        .on("finish",() => {
            serverQueue.songs.shift();
            play(guild,serverQueue.songs[0]);
        })
        .on("error", error => console.error(error));
    dispatcher.setVolumeLogarithmic(0.5);
    serverQueue.textChannel.send(`Start playing: **${song.title}**`);
}
//create a skip function
function skip(message,serverQueue){
    if(!message.member.voice.channel)
        return message.channel.send("You are not in the channel! 您不在语音频道中！");
    if(!serverQueue)
        return message.channel.send("The queue is empty! 列表为空！");
    serverQueue.connection.dispatcher.end();
}
//stop function
function stop(message, serverQueue) {
    if(!message.member.voice.channel)
        return message.channel.send("You are not in the channel! 您不在语音频道中！");
    message.channel.send("Seeya~~");
    serverQueue.songs = [];
    serverQueue.connection.dispatcher.end();
    
}
//leave function
/*function leave(message, serverQueue){
    serverQueue.songs = [];
    serverQueue.connection.dispatcher.end();
    message.channel.send("Seeya~~");
    message.member.voice.channel.leave();
    queue.delete(message.guild.id);
}*/
client.login(token);