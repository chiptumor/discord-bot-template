import FileSystem from "node:fs/promises";
import Module from "node:module";
import Path from "node:path";
import Url from "node:url";
import * as Discord from "discord.js";
import type { Client } from "./types/client.ts";

const require: (string) => any = Module.createRequire(import.meta.url);

const importURL = Url.fileURLToPath(import.meta.url);
let resolvePath = (...path) => Path.resolve(importURL, ...path);
let getImport = async (...path) => require(resolvePath(...path));

let collectionsFromKeys = (...keys: (keyof any)[]) =>
    Object.fromEntries(keys.map(i => [ i, new Discord.Collection() ]));


const client = <Client> new Discord.Client({
    intents: [
        Discord.GatewayIntentBits.Guilds,
        Discord.GatewayIntentBits.GuildMessages,
        Discord.GatewayIntentBits.MessageContent
    ]
});

client.commands = new Discord.Collection();
client.aliases = <Client["aliases"]> {
    interaction: {
        component: new Discord.Collection(),
        [Discord.InteractionType.ApplicationCommand]:
            collectionsFromKeys(
                Discord.ApplicationCommandType.ChatInput,
                Discord.ApplicationCommandType.User,
                Discord.ApplicationCommandType.Message,
                Discord.ApplicationCommandType.PrimaryEntryPoint
            )
    },
    event: {
        [Discord.Events.MessageCreate]:
            new Discord.Collection()
    }
};

const setupPromises = [];

setupPromises.push((async () => {
    client.secret = await getImport("./config/secret.js");
})());

setupPromises.push((async () => {
    // read all files from ./commands/...
    const directory = resolvePath("./commands/");
    FileSystem.readdir(directory, { recursive: true })
    // only get files named 'command.js'
    .then(files => files.filter(file => file.match(/command\.js$/))
        .forEach(file => getImport(directory, file).then((
            // T = type of values from Client.commands's collections
            command: Client["commands"] extends
                Discord.Collection<string, infer T> ? T : never
        ) => {
            if (command.config && (command.config.enabled ?? true)) {
                // set command entry
                client.commands.set(name = command.config.name, command);

                client.aliases.interaction.component
                    .set(command.config.componentAlias, name);

                Object.entries(command.interaction[
                    t = Discord.InteractionType.ApplicationCommand
                ]).forEach(([ a, value ]) =>
                    client.aliases.interaction[t][a].set(value.data.name, name)
                );
            }
        }))
    );
})());

setupPromises.push((async () => {
    // read all files from ./events/...
    const directory = resolvePath("./events/");
    FileSystem.readdir(directory, { recursive: true })
    // only get files ending in '.js'
    .then(files => files.filter(file => file.match(/\.js$/))
        .forEach(file => getImport(directory, file).then(event =>
            client[event.once ? "once" : "on"](event.name, event.execute)
        ))
    );
})());

Promise.all(setupPromises).then(() =>
    client.login(client.secret.bot.token)
);
