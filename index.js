const Discord = require('discord.js');
const{
    prefix,
    token,
} = require('./config.json');
const Util = require('discord.js');
const ytdl = require('ytdl-core');
const YouTube = require('simple-youtube-api');
const youtube = new YouTube('AIzaSyCfHFxNvaG_CLLPQ0HdtjVBy9Gmkf6rjdA');

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
        clear(message, serverQueue);
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
async function execute(msg, serverQueue){
    const args = msg.content.split(" ");
    const url = args[1] ? args[1].replace(/<(.+)>/g, '$1') : '';
    

    const voiceChannel = msg.member.voice.channel;
    if(!voiceChannel)
        return msg.channel.send(
            "You are not in the voice channel!"
        );
    const permissions = voiceChannel.permissionsFor(msg.client.user);
    if(!permissions.has("CONNECT") || !permissions.has("SPEAK")) {
        return msg.channel.send(
            "I need permissions to join and speak in the channel!"
        );
    }

    //check if url is playlist
    if (url.match(/^https?:\/\/(www.youtube.com|youtube.com)\/playlist(.*)$/)) {
        const playlist = await youtube.getPlaylist(url);
        const videos = await playlist.getVideos();
        for (const video of Object.values(videos)) {
            const video2 = await youtube.getVideoByID(video.id); // eslint-disable-line no-await-in-loop
            await handleVideo(video2, msg, voiceChannel, true) // eslint-disable-line no-await-in-loop
        }
        return msg.channel.send({embed: {
            color: 15158332,
            fields: [{
                name: "✅ Added playlist",
                value: `Playlist: **${playlist.title}** has been added to the queue!`
              }
            ]
          }
        });
    }
    else {
        try{
            var video = await youtube.getVideo(url);
        } catch (error) {
            console.log(`cannot find song with the url: ${err}`);
            return message.channel.send(`cannot find song with the url: ${err}`);
        }
        return handleVideo(video, msg, voiceChannel);
    }

    //use ytdl to get songinfo and save in song object
    /*const songInfo = await ytdl.getInfo(args[1])
    const song = {
        title: songInfo.title,
        url: songInfo.video_url,
    };*/

    //add songs into queue if queue exist
    /*if (!serverQueue) {
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
        }*/
}

//handlevideo
async function handleVideo(video,msg,voiceChannel,playlist = false){
    const serverQueue = queue.get(msg.guild.id);
    const song = {
        id: video.id,
        title: Util.escapeMarkdown(video.title),
        url: `https://www.youtube.com/watch?v=${video.id}`
    };
    if(!serverQueue) {
        const queueConstruct = {
            textChannel: msg.channel,
            voiceChannel: voiceChannel,
            connection: null,
            songs: [],
            volume: 5,
            playing: true
        };
        queue.set(msg.guild.id, queueConstruct);
        queueConstruct.songs.push(song);

        try{
            var connection = await voiceChannel.join();
            queueConstruct.connection = connection;
            play(msg.guild,queueConstruct.songs[0]);
        }
        catch (error) {
            console.error(`could not join the voicechannel: ${error}`);
            queue.delete(msg.guild.id);
            return msg.channel.send(`could not join the voice channel: ${error}`);
        }
    }
    else{
        serverQueue.songs.push(song);
        if(playlist) return undefined;
        else return msg.channel.send(`*${song.title}* has been added to the queue`);
    }
    return undefined;
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
            console.log('Song ended.');
            serverQueue.songs.shift();
            play(guild,serverQueue.songs[0]);
        })
        .on("error", error => console.error(error));
    dispatcher.setVolumeLogarithmic(0.5);
    serverQueue.textChannel.send(`Start playing: **${song.title}**`);
}
//create a skip function
function skip(msg,serverQueue){
    console.log(`${msg.author.tag} has been used skip command in ${msg.guild.name}`)
    if(!msg.member.voice.channel)
        return msg.channel.send("You are not in the channel!");
    if(!serverQueue)
        return msg.channel.send("The queue is empty!");
    serverQueue.connection.dispatcher.end();
}
//clear function
function clear(message, serverQueue) {
    if(!message.member.voice.channel)
        return message.channel.send("You are not in the channel!");
    message.channel.send("Queue was cleared, Seeya~~");
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