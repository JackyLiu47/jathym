const Discord = require('discord.js');
const{
    prefix,
    token,
} = require('./config.json');
const Util = require('discord.js');
const ytdl = require('ytdl-core');
const YouTube = require('simple-youtube-api');
const youtube = new YouTube('your_api_key');

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
client.on('message', async msg => {
    if (msg.author.bot) return;
    if (!msg.content.startsWith(prefix)) return;

    const serverQueue = queue.get(msg.guild.id)

    if(msg.content.startsWith(`${prefix}play`)) {
        execute(msg,serverQueue);
        return;
    }
    else if (msg.content.startsWith(`${prefix}skip`)){
        skip(msg, serverQueue);
        return;
    }
    else if (msg.content.startsWith(`${prefix}stop`)){
        stop(msg, serverQueue);
        return;
    }
    else if (msg.content.startsWith(`${prefix}now`)){
        now(msg, serverQueue);
    }
    else if (msg.content.startsWith(`${prefix}pause`)){
        pause(msg,serverQueue);
    }
    else if (msg.content.startsWith(`${prefix}resume`)){
        resume(msg,serverQueue);
    }
    else if (msg.content.startsWith(`${prefix}help`)){
        help(msg,serverQueue);
    }
    else {
        return msg.channel.send("You need to enter a valid command!");
    }
});


//check user status and permissions
async function execute(msg, serverQueue){
    const args = msg.content.split(" ");
    const url = args[1] ? args[1].replace(/<(.+)>/g, '$1') : '';
    const searchString = args.slice(1).join(' ');

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
            const video2 = await youtube.getVideoByID(video.id);
            await handleVideo(video2, msg, voiceChannel, true) 
        }
        return msg.channel.send({embed: {
            color: 15158332,
            fields: [{
                name: "✅ **PLAYLIST ADDED**",
                value: `Playlist: **${playlist.title}** has been added to the queue!`
              }
            ]
          }
        });
    }
    else {
        try {
            var video = await youtube.getVideo(url);
        } catch (error) {
            console.log(`cannot find song as a url, try search`);
            try {
                var videos = await youtube.searchVideos(searchString, 10);
                let index = 0;
                msg.channel.send({embed: {
                    color: 15158332,
                    fields: [{
                        name: "📋 Song selection",
                        value: `${videos.map(video2 => `\`${++index}\` **-** ${video2.title}`).join('\n')}`
                      },
                      {
                          name: "You have 10 seconds!",
                          value: "Provide a value to select on of the search results ranging from 1-10."
                      }
                    ]
                  }
                });
                // eslint-disable-next-line max-depth
                try {
                    var response = await msg.channel.awaitMessages(msg2 => msg2.content > 0 && msg2.content < 11, {
                        max: 1,
                        time: 10000,
                        errors: ['time']
                    });
                    console.log(`get message response ${response.content}`)
                } catch (err) {
                    console.error(err);
                    return msg.channel.send({embed: {
                        color: 15158332,
                        fields: [{
                            name: "❌ Error",
                            value: 'No or invalid value entered, cancelling video selection...'
                          }
                        ]
                      }
                    });
                }
                const videoIndex = (response.first().content);
                var video = await youtube.getVideoByID(videos[videoIndex - 1].id);
            } catch (err) {
                console.error(err);
                return msg.channel.send({embed: {
                    color: 15158332,
                    fields: [{
                        name: "❌ Error",
                        value: 'I could not obtain any search results.'
                      }
                    ]
                  }
                });
            }
            //return msg.channel.send(`Cannot find song with the url: ${err}`);
        }
        return handleVideo(video, msg, voiceChannel);
    }
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
            return msg.channel.send({embed: {
                color: 15158332,
                fields: [{
                    name: "❌ **Error**",
                    value: `Could not join the voice channel: ${error}`
                  }
                ]
              }
            });
        }
    }
    else{
        serverQueue.songs.push(song);
        if(playlist) return undefined;
        else return msg.channel.send({embed: {
                color: 15158332,
                fields: [{
                    name: "✅ **MUSIC ADDED**",
                    value: `*${song.title}* has been added to the queue`
                }
                ]
            }
            }) 
    }
    return undefined;
}

//create a play function
function play(guild, song) {
    console.log(`Playing music in ${guild.name}`);
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
function stop(msg, serverQueue) {
    console.log(`${msg.author.tag} has been used stop command in ${msg.guild.name}`)
    if(!msg.member.voice.channel)
        return msg.channel.send({embed: {
            color: 15158332,
            fields: [{
                name: "❌ **ERROR**",
                value: 'You are not in the voice channel'
              }
            ]
          }
        });
    msg.channel.send({embed: {
        color: 15158332,
        fields: [{
            name: "👋 **Bye Bye!**",
            value: 'Queue was cleared, Seeya~~😘'
            }
        ]
        }
    });
    //msg.channel.send("Queue was cleared, Seeya~~😘");
    serverQueue.songs = [];
    serverQueue.connection.dispatcher.end();
    
}
//now playing function
function now(msg, serverQueue) {
    console.log(`${msg.author.tag} has been used now command in ${msg.guild.name}`)
    if(!msg.member.voice.channel)
        return msg.channel.send({embed: {
            color: 15158332,
            fields: [{
                name: "❌ **ERROR**",
                value: 'You are not in the voice channel'
              }
            ]
          }
        });
    if(!serverQueue)
        return msg.channel.send({embed: {
            color: 15158332,
            fields: [{
                name: "❌ **ERROR**",
                value: 'There is nothing playing that I could skip for you.'
              }
            ]
          }
        });
    return msg.channel.send({embed: {
        color: 15158332,
        fields: [{
            name: "🎶 **NOW PLAYING**",
            value: `**${serverQueue.songs[0].title}**`
          }
        ]
      }
    });
}
//pause function
function pause(msg, serverQueue) {
    console.log(`${msg.author.tag} has been used pause command in ${msg.guild.name}`)
    if(!msg.member.voice.channel)
        return msg.channel.send({embed: {
            color: 15158332,
            fields: [{
                name: "❌ **ERROR**",
                value: 'You are not in the voice channel'
              }
            ]
          }
        });
    if(!serverQueue)
        return msg.channel.send({embed: {
            color: 15158332,
            fields: [{
                name: "❌ **ERROR**",
                value: 'There is nothing playing'
              }
            ]
          }
        });
    if (serverQueue && serverQueue.playing) {
        serverQueue.playing = false;
        serverQueue.connection.dispatcher.pause();
        return msg.channel.send({embed: {
            color: 15158332,
            fields: [{
                name: "⏯️ **PAUSE**",
                value: `I have paused **${serverQueue.songs[0].title}** for you!`
              }
            ]
          }
        });
    }
}
//resume function
function resume(msg, serverQueue) {
    console.log(`${msg.author.tag} has been used resume command in ${msg.guild.name}`)
    if(!msg.member.voice.channel)
        return msg.channel.send({embed: {
            color: 15158332,
            fields: [{
                name: "❌ Error",
                value: 'You are not in the voice channel'
              }
            ]
          }
        });
    if(!serverQueue)
        return msg.channel.send({embed: {
            color: 15158332,
            fields: [{
                name: "❌ **ERROR**",
                value: 'There is nothing playing'
              }
            ]
          }
        });
    if (serverQueue && !serverQueue.playing) {
        serverQueue.playing = true;
        serverQueue.connection.dispatcher.resume();
        return msg.channel.send({embed: {
            color: 15158332,
            fields: [{
                name: "▶️ **RESUME**",
                value: `I have resumed **${serverQueue.songs[0].title}** for you!`
              }
            ]
          }
        });
    }
    else return msg.channel.send({embed: {
        color: 15158332,
        fields: [{
            name: "❌ **ERROR**",
            value: `It's already playing, enjoy it😘`
          }
        ]
      }
    });
}
//help function
function help(msg,serverQueue) {
    console.log(`${msg.author.tag} has been used the help command in ${msg.guild.name}`);
    msg.channel.send({embed: {
        color: 15158332,
        fields: [{
            name: "✅ **COMMAND LIST**",
            value: `The prefix of the bot is ${prefix}\n
                    **${prefix}help**  ---- Show the command list.\n
                    **${prefix}play**  ---- Play a song from Youtube song or playlist url.\n
                    **${prefix}pause** ---- Pause the music.\n
                    **${prefix}resume**---- Resume the music.\n
                    **${prefix}now**   ---- Show the music now playing.\n
                    **${prefix}skip**  ---- Skip to the next song.\n
                    **${prefix}stop**  ---- Stop and leave the channel`
          }
        ]
      }
    });
}

client.login(token);
