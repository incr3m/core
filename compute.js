var utility = require('./utility');
var mode = utility.mode;
var generatePositionData = utility.generatePositionData;
var isRadiant = utility.isRadiant;
var constants = require('./constants.json');
var mergeObjects = utility.mergeObjects;
var sentiment = require('sentiment');
/**
 * Computes additional match stats based on parsed_data
 **/
function computeMatchData(match) {
        //todo what if we encounter a match with invalid data, try/catch?
        //v4,v5,v6 should be okay
        //v3,v2,no version(v1) previously set to null
        match.player_win = (isRadiant(match.players[0]) === match.radiant_win); //did the player win?
        var date = new Date(match.start_time * 1000);
        for (var i = 0; i < constants.patches.length; i++) {
            var pd = new Date(constants.patches[i].date);
            //stop when patch date is less than the start time
            if (pd < date) {
                break;
            }
        }
        match.patch = i;
        //add a parsedplayer property to each player, and compute more stats
        match.players.forEach(function(player, ind) {
            player.isRadiant = isRadiant(player);
            var p = {};
            if (match.parsed_data) {
                //mapping 0 to 0, 128 to 5, etc.
                //if we projected only one player, then use slot 0
                var parseSlot = match.parsed_data.players.length === 1 ? 0 : player.player_slot % (128 - 5);
                p = match.parsed_data.players[parseSlot];
                //remove meepo/meepo kills
                if (player.hero_id === 82) {
                    p.kills_log = p.kills_log.filter(function(k) {
                        k.key !== "npc_dota_hero_meepo";
                    });
                }
                //console.log(parseSlot, match.parsed_data);
                if (p.kills) {
                    p.neutral_kills = 0;
                    p.tower_kills = 0;
                    p.courier_kills = 0;
                    for (var key in p.kills) {
                        if (key.indexOf("npc_dota_neutral") === 0) {
                            p.neutral_kills += p.kills[key];
                        }
                        if (key.indexOf("_tower") !== -1) {
                            p.tower_kills += p.kills[key];
                        }
                        if (key.indexOf("courier") !== -1) {
                            p.courier_kills += p.kills[key];
                        }
                    }
                }
                if (p.buyback_log) {
                    p.buyback_count = p.buyback_log.length;
                }
                if (p.item_uses) {
                    p.observer_uses = p.item_uses.ward_observer || 0;
                    p.sentry_uses = p.item_uses.ward_sentry || 0;
                }
                if (p.gold) {
                    //lane efficiency: divide 10 minute gold by static amount based on standard creep spawn
                    p.lane_efficiency = (p.gold[10] || 0) / (43 * 60 + 48 * 20 + 74 * 2);
                }
                //convert position hashes to heatmap array of x,y,value
                var d = {
                    "obs": true,
                    "sen": true,
                    //"pos": true,
                    "lane_pos": true
                };
                p.posData = generatePositionData(d, p);
                //p.explore = p.posData.pos.length / 128 / 128;
                //compute lanes
                var lanes = [];
                for (var i = 0; i < p.posData.lane_pos.length; i++) {
                    var dp = p.posData.lane_pos[i];
                    for (var j = 0; j < dp.value; j++) {
                        lanes.push(constants.lanes[dp.y][dp.x]);
                    }
                }
                if (lanes.length) {
                    p.lane = mode(lanes);
                    var radiant = player.isRadiant;
                    var lane_roles = {
                        "1": function() {
                            //bot
                            return radiant ? "Safe" : "Off";
                        },
                        "2": function() {
                            //mid
                            return "Mid";
                        },
                        "3": function() {
                            //top
                            return radiant ? "Off" : "Safe";
                        },
                        "4": function() {
                            //rjung
                            return "Jungle";
                        },
                        "5": function() {
                            //djung
                            return "Jungle";
                        }
                    };
                    p.lane_role = lane_roles[p.lane] ? lane_roles[p.lane]() : undefined;
                }
                //compute hashes of purchase time sums and counts from logs
                if (p.purchase_log) {
                    p.purchase_time = {};
                    p.purchase_time_count = {};
                    for (var i = 0; i < p.purchase_log.length; i++) {
                        var k = p.purchase_log[i].key;
                        var time = p.purchase_log[i].time;
                        if (!p.purchase_time[k]) {
                            p.purchase_time[k] = 0;
                            p.purchase_time_count[k] = 0;
                        }
                        p.purchase_time[k] += time;
                        p.purchase_time_count[k] += 1;
                    }
                }
            }
            player.parsedPlayer = p;
        });
    }
    /**
     * Renders display-only data for a match
     **/
function renderMatch(match) {
        var schema = utility.getParseSchema();
        //make sure match.parsed_data is not null
        match.parsed_data = match.parsed_data || schema;
        //make sure parsed_data has all fields
        for (var key in schema) {
            match.parsed_data[key] = match.parsed_data[key] || schema[key];
        }
        //make sure each player's parsedplayer has all fields
        match.players.forEach(function(p, i) {
            mergeObjects(p.parsedPlayer, schema.players[i]);
        });
        match.players.forEach(function(player, i) {
            //converts hashes to arrays and sorts them
            var p = player.parsedPlayer;
            var t = [];
            for (var key in p.ability_uses) {
                var a = constants.abilities[key];
                if (a) {
                    var ability = {};
                    ability.img = a.img;
                    ability.name = key;
                    ability.val = p.ability_uses[key];
                    ability.hero_hits = p.hero_hits[key];
                    t.push(ability);
                }
                else {
                    console.log(key);
                }
            }
            t.sort(function(a, b) {
                return b.val - a.val;
            });
            p.ability_uses_arr = t;
            var u = [];
            for (var key in p.item_uses) {
                var b = constants.items[key];
                if (b) {
                    var item = {};
                    item.img = b.img;
                    item.name = key;
                    item.val = p.item_uses[key];
                    u.push(item);
                }
                else {
                    console.log(key);
                }
            }
            u.sort(function(a, b) {
                return b.val - a.val;
            });
            p.item_uses_arr = u;
            var v = [];
            for (var key in p.damage) {
                var c = constants.hero_names[key];
                if (c) {
                    var dmg = {};
                    dmg.img = c.img;
                    dmg.val = p.damage[key];
                    dmg.kills = p.kills[key];
                    v.push(dmg);
                }
                else {
                    //console.log(key);
                }
            }
            v.sort(function(a, b) {
                return b.val - a.val;
            });
            p.damage_arr = v;
            //filter interval data to only be >= 0
            if (p.times) {
                var intervals = ["lh", "gold", "xp", "times"];
                intervals.forEach(function(key) {
                    p[key] = p[key].filter(function(el, i) {
                        return p.times[i] >= 0;
                    });
                });
            }
        });
        match.chat = match.parsed_data.chat;
        match.chat_words = match.chat.map(function(c) {
            return c.key;
        }).join(' ');
        match.sentiment = sentiment(match.chat_words, {
            "report": -2,
            "bg": -1,
            "feed": -1,
            "noob": -1,
            "commend": 2,
            "ty": 1,
            "thanks": 1,
            "wp": 1,
            "end": -1,
            "garbage": -1,
            "trash": -1
        });
        match.graphData = generateGraphData(match);
        match.posData = match.players.map(function(p) {
            return p.parsedPlayer.posData;
        });
    }
    /**
     * Generates data for c3 charts in a match
     **/
function generateGraphData(match) {
    //compute graphs
    var goldDifference = ['Gold'];
    var xpDifference = ['XP'];
    for (var i = 0; i < match.parsed_data.players[0].times.length; i++) {
        var goldtotal = 0;
        var xptotal = 0;
        match.players.forEach(function(elem, j) {
            var p = elem.parsedPlayer;
            if (elem.isRadiant) {
                goldtotal += p.gold[i];
                xptotal += p.xp[i];
            }
            else {
                xptotal -= p.xp[i];
                goldtotal -= p.gold[i];
            }
        });
        goldDifference.push(goldtotal);
        xpDifference.push(xptotal);
    }
    var time = ["time"].concat(match.parsed_data.players[0].times);
    var data = {
        difference: [time, xpDifference, goldDifference],
        gold: [time],
        xp: [time],
        lh: [time]
    };
    match.players.forEach(function(elem, i) {
        var p = elem.parsedPlayer;
        var hero = constants.heroes[elem.hero_id] || {};
        hero = hero.localized_name;
        data.gold.push([hero].concat(p.gold));
        data.xp.push([hero].concat(p.xp));
        data.lh.push([hero].concat(p.lh));
    });
    //data for income chart
    var gold_reasons = [];
    var columns = [];
    var categories = [];
    var orderedPlayers = match.players.slice(0);
    orderedPlayers.sort(function(a, b) {
        return b.gold_per_min - a.gold_per_min;
    });
    orderedPlayers.forEach(function(player) {
        var hero = constants.heroes[player.hero_id] || {};
        categories.push(hero.localized_name);
    });
    for (var key in constants.gold_reasons) {
        var reason = constants.gold_reasons[key].name;
        gold_reasons.push(reason);
        var col = [reason];
        orderedPlayers.forEach(function(player) {
            var g = player.parsedPlayer.gold_reasons;
            col.push(g[key] || 0);
        });
        columns.push(col);
    }
    data.cats = categories;
    data.goldCols = columns;
    data.gold_reasons = gold_reasons;
    return data;
}
module.exports = {
    renderMatch: renderMatch,
    computeMatchData: computeMatchData
};