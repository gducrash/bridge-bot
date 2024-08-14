import * as discord from './discord';
import * as telegram from './telegram';

discord.init().then(() => {
    telegram.init();
});