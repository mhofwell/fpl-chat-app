# Fantasy Premiere League API Description

Here are the API endpoints that we use to get data about players, points, fixtures, leagues, etc.

BASE_URL=https://fantasy.premierleague.com/api/

# Available endpoints:

# 1. General Information

## Endpoint path: bootstrap-static/

This endpoint returns general information about the FPL game divided into these sections:

```json
{
    "events":[
        ...
    ],
    "teams":[
        ...
    ],
    "element_types":[
        ...
    ],
    "elements":[
        ...
    ]
}
```

Events: Basic information of every Gameweek such as average score, highest score, top scoring player, most captained, etc.

```json
"events": [
    {
        "id": 1,
        "name": "Gameweek 1",
        "deadline_time": "2024-08-16T17:30:00Z",
        "release_time": null,
        "average_entry_score": 57,
        "finished": true,
        "data_checked": true,
        "highest_scoring_entry": 3546234,
        "deadline_time_epoch": 1723829400,
        "deadline_time_game_offset": 0,
        "highest_score": 127,
        "is_previous": false,
        "is_current": false,
        "is_next": false,
        "cup_leagues_created": false,
        "h2h_ko_matches_created": false,
        "can_enter": false,
        "can_manage": false,
        "released": true,
        "ranked_count": 8597356,
        "overrides": {
            "rules": {},
            "scoring": {},
            "element_types": [],
            "pick_multiplier": null
        },
        "chip_plays": [
            {
                "chip_name": "bboost",
                "num_played": 144974
            },
            {
                "chip_name": "3xc",
                "num_played": 221430
            }
        ],
        "most_selected": 401,
        "most_transferred_in": 27,
        "top_element": 328,
        "top_element_info": {
            "id": 328,
            "points": 14
        },
        "transfers_made": 0,
        "most_captained": 351,
        "most_vice_captained": 351
    },
    ...
]
```

Teams: Basic information of current Premier League clubs.

```json
"teams": [
        {
            "code": 3,
            "draw": 0,
            "form": null,
            "id": 1,
            "loss": 0,
            "name": "Arsenal",
            "played": 0,
            "points": 0,
            "position": 2,
            "short_name": "ARS",
            "strength": 5,
            "team_division": null,
            "unavailable": false,
            "win": 0,
            "strength_overall_home": 1350,
            "strength_overall_away": 1350,
            "strength_attack_home": 1390,
            "strength_attack_away": 1400,
            "strength_defence_home": 1310,
            "strength_defence_away": 1300,
            "pulse_id": 1
        },
        ...
]
```

Element_types: Basic information about player's position (GK, DEF, MID, FWD).

```json
"element_types": [
        {
            "id": 1,
            "plural_name": "Goalkeepers",
            "plural_name_short": "GKP",
            "singular_name": "Goalkeeper",
            "singular_name_short": "GKP",
            "squad_select": 2,
            "squad_min_select": null,
            "squad_max_select": null,
            "squad_min_play": 1,
            "squad_max_play": 1,
            "ui_shirt_specific": true,
            "sub_positions_locked": [
                12
            ],
            "element_count": 82
        },
        ...
]
```

Elements: Information of all Premier League players including points, status, value, match stats (goals, assists, etc.), ICT index, etc.

```json
"elements": [
        {
            "can_transact": true,
            "can_select": false,
            "chance_of_playing_next_round": 0,
            "chance_of_playing_this_round": 0,
            "code": 438098,
            "cost_change_event": 0,
            "cost_change_event_fall": 0,
            "cost_change_start": -1,
            "cost_change_start_fall": 1,
            "dreamteam_count": 0,
            "element_type": 3,
            "ep_next": "0.0",
            "ep_this": "0.0",
            "event_points": 0,
            "first_name": "Fábio",
            "form": "0.0",
            "id": 1,
            "in_dreamteam": false,
            "news": "Has joined Portuguese side FC Porto on loan for the 2024/25 season",
            "news_added": "2024-08-29T11:06:25.241953Z",
            "now_cost": 54,
            "photo": "438098.jpg",
            "points_per_game": "0.0",
            "removed": false,
            "second_name": "Ferreira Vieira",
            "selected_by_percent": "0.0",
            "special": false,
            "squad_number": null,
            "status": "u",
            "team": 1,
            "team_code": 3,
            "total_points": 0,
            "transfers_in": 439,
            "transfers_in_event": 0,
            "transfers_out": 2823,
            "transfers_out_event": 0,
            "value_form": "0.0",
            "value_season": "0.0",
            "web_name": "Fábio Vieira",
            "region": null,
            "team_join_date": null,
            "birth_date": null,
            "has_temporary_code": false,
            "opta_code": "p438098",
            "minutes": 0,
            "goals_scored": 0,
            "assists": 0,
            "clean_sheets": 0,
            "goals_conceded": 0,
            "own_goals": 0,
            "penalties_saved": 0,
            "penalties_missed": 0,
            "yellow_cards": 0,
            "red_cards": 0,
            "saves": 0,
            "bonus": 0,
            "bps": 0,
            "influence": "0.0",
            "creativity": "0.0",
            "threat": "0.0",
            "ict_index": "0.0",
            "starts": 0,
            "expected_goals": "0.00",
            "expected_assists": "0.00",
            "expected_goal_involvements": "0.00",
            "expected_goals_conceded": "0.00",
            "mng_win": 0,
            "mng_draw": 0,
            "mng_loss": 0,
            "mng_underdog_win": 0,
            "mng_underdog_draw": 0,
            "mng_clean_sheets": 0,
            "mng_goals_scored": 0,
            "influence_rank": 790,
            "influence_rank_type": 341,
            "creativity_rank": 790,
            "creativity_rank_type": 341,
            "threat_rank": 787,
            "threat_rank_type": 340,
            "ict_index_rank": 790,
            "ict_index_rank_type": 341,
            "corners_and_indirect_freekicks_order": null,
            "corners_and_indirect_freekicks_text": "",
            "direct_freekicks_order": null,
            "direct_freekicks_text": "",
            "penalties_order": null,
            "penalties_text": "",
            "expected_goals_per_90": 0,
            "saves_per_90": 0,
            "expected_assists_per_90": 0,
            "expected_goal_involvements_per_90": 0,
            "expected_goals_conceded_per_90": 0,
            "goals_conceded_per_90": 0,
            "now_cost_rank": 133,
            "now_cost_rank_type": 81,
            "form_rank": 771,
            "form_rank_type": 332,
            "points_per_game_rank": 789,
            "points_per_game_rank_type": 341,
            "selected_rank": 712,
            "selected_rank_type": 294,
            "starts_per_90": 0,
            "clean_sheets_per_90": 0
        },
        ...
]
```

### 2. Fixtures

Endpoint path: fixtures/
Full URL: https://fantasy.premierleague.com/api/fixtures/

This endpoint returns a JSON array which contains every fixture of the season:

```json
[
    {
        "code": 2444470,
        "event": 1,
        "finished": true,
        "finished_provisional": true,
        "id": 1,
        "kickoff_time": "2024-08-16T19:00:00Z",
        "minutes": 90,
        "provisional_start_time": false,
        "started": true,
        "team_a": 9,
        "team_a_score": 0,
        "team_h": 14,
        "team_h_score": 1,
        "stats": [
            {
                "identifier": "goals_scored",
                "a": [],
                "h": [
                    {
                        "value": 1,
                        "element": 389
                    }
                ]
            },
            {
                "identifier": "assists",
                "a": [],
                "h": [
                    {
                        "value": 1,
                        "element": 372
                    }
                ]
            },
            {
                "identifier": "own_goals",
                "a": [],
                "h": []
            },
            {
                "identifier": "penalties_saved",
                "a": [],
                "h": []
            },
            {
                "identifier": "penalties_missed",
                "a": [],
                "h": []
            },
            {
                "identifier": "yellow_cards",
                "a": [
                    {
                        "value": 1,
                        "element": 240
                    },
                    {
                        "value": 1,
                        "element": 241
                    },
                    {
                        "value": 1,
                        "element": 243
                    }
                ],
                "h": [
                    {
                        "value": 1,
                        "element": 377
                    },
                    {
                        "value": 1,
                        "element": 382
                    }
                ]
            },
            {
                "identifier": "red_cards",
                "a": [],
                "h": []
            },
            {
                "identifier": "saves",
                "a": [
                    {
                        "value": 4,
                        "element": 248
                    }
                ],
                "h": [
                    {
                        "value": 2,
                        "element": 383
                    }
                ]
            },
            {
                "identifier": "bonus",
                "a": [],
                "h": [
                    {
                        "value": 3,
                        "element": 389
                    },
                    {
                        "value": 2,
                        "element": 594
                    },
                    {
                        "value": 1,
                        "element": 369
                    },
                    {
                        "value": 1,
                        "element": 380
                    }
                ]
            },
            {
                "identifier": "bps",
                "a": [
                    {
                        "value": 16,
                        "element": 249
                    },
                    {
                        "value": 15,
                        "element": 240
                    },
                    {
                        "value": 15,
                        "element": 255
                    },
                    {
                        "value": 13,
                        "element": 245
                    },
                    {
                        "value": 12,
                        "element": 248
                    },
                    {
                        "value": 11,
                        "element": 19
                    },
                    {
                        "value": 10,
                        "element": 251
                    },
                    {
                        "value": 7,
                        "element": 257
                    },
                    {
                        "value": 5,
                        "element": 239
                    },
                    {
                        "value": 5,
                        "element": 241
                    },
                    {
                        "value": 5,
                        "element": 247
                    },
                    {
                        "value": 4,
                        "element": 254
                    },
                    {
                        "value": 4,
                        "element": 259
                    },
                    {
                        "value": 3,
                        "element": 252
                    },
                    {
                        "value": 2,
                        "element": 243
                    },
                    {
                        "value": 2,
                        "element": 256
                    }
                ],
                "h": [
                    {
                        "value": 33,
                        "element": 389
                    },
                    {
                        "value": 32,
                        "element": 594
                    },
                    {
                        "value": 26,
                        "element": 369
                    },
                    {
                        "value": 26,
                        "element": 380
                    },
                    {
                        "value": 25,
                        "element": 383
                    },
                    {
                        "value": 22,
                        "element": 377
                    },
                    {
                        "value": 21,
                        "element": 378
                    },
                    {
                        "value": 19,
                        "element": 368
                    },
                    {
                        "value": 11,
                        "element": 364
                    },
                    {
                        "value": 11,
                        "element": 372
                    },
                    {
                        "value": 10,
                        "element": 366
                    },
                    {
                        "value": 5,
                        "element": 385
                    },
                    {
                        "value": 3,
                        "element": 381
                    },
                    {
                        "value": 3,
                        "element": 593
                    },
                    {
                        "value": 2,
                        "element": 371
                    },
                    {
                        "value": -1,
                        "element": 382
                    }
                ]
            },
            {
                "identifier": "mng_underdog_win",
                "a": [],
                "h": []
            },
            {
                "identifier": "mng_underdog_draw",
                "a": [],
                "h": []
            }
        ],
        "team_h_difficulty": 3,
        "team_a_difficulty": 3,
        "pulse_id": 115827
    }
]
```

To get fixtures for specific Gameweek, you can add a parameter after the endpoint path (ex: fixtures?event=7). You will get an array of objects in this format:

```json
{
    "code": 2444535,
    "event": 7,
    "finished": true,
    "finished_provisional": true,
    "id": 66,
    "kickoff_time": "2024-10-05T11:30:00Z",
    "minutes": 90,
    "provisional_start_time": false,
    "started": true,
    "team_a": 12,
    "team_a_score": 1,
    "team_h": 7,
    "team_h_score": 0,
    "stats": [
        {
            "identifier": "goals_scored",
            "a": [
                {
                    "value": 1,
                    "element": 317
                }
            ],
            "h": []
        },
        {
            "identifier": "assists",
            "a": [
                {
                    "value": 1,
                    "element": 321
                }
            ],
            "h": []
        },
        {
            "identifier": "own_goals",
            "a": [],
            "h": []
        },
        {
            "identifier": "penalties_saved",
            "a": [],
            "h": []
        },
        {
            "identifier": "penalties_missed",
            "a": [],
            "h": []
        },
        {
            "identifier": "yellow_cards",
            "a": [
                {
                    "value": 1,
                    "element": 321
                },
                {
                    "value": 1,
                    "element": 329
                }
            ],
            "h": [
                {
                    "value": 1,
                    "element": 11
                },
                {
                    "value": 1,
                    "element": 203
                },
                {
                    "value": 1,
                    "element": 206
                },
                {
                    "value": 1,
                    "element": 585
                }
            ]
        },
        {
            "identifier": "red_cards",
            "a": [],
            "h": []
        },
        {
            "identifier": "saves",
            "a": [
                {
                    "value": 4,
                    "element": 310
                },
                {
                    "value": 1,
                    "element": 660
                }
            ],
            "h": [
                {
                    "value": 3,
                    "element": 201
                }
            ]
        },
        {
            "identifier": "bonus",
            "a": [
                {
                    "value": 3,
                    "element": 310
                },
                {
                    "value": 2,
                    "element": 311
                },
                {
                    "value": 2,
                    "element": 339
                }
            ],
            "h": []
        },
        {
            "identifier": "bps",
            "a": [
                {
                    "value": 32,
                    "element": 310
                },
                {
                    "value": 31,
                    "element": 311
                },
                {
                    "value": 31,
                    "element": 339
                },
                {
                    "value": 30,
                    "element": 321
                },
                {
                    "value": 26,
                    "element": 337
                },
                {
                    "The rest of the objects..."
                },

            ],
            "h": [
                {
                    "value": 22,
                    "element": 196
                },
                {
                    "value": 13,
                    "element": 200
                },
                {
                    "value": 12,
                    "element": 201
                },
                {
                    "value": 10,
                    "element": 199
                },
                {
                    "The rest of the objects..."
                },
            ]
        },
        {
            "identifier": "mng_underdog_win",
            "a": [],
            "h": []
        },
        {
            "identifier": "mng_underdog_draw",
            "a": [],
            "h": []
        }
    ],
    "team_h_difficulty": 5,
    "team_a_difficulty": 3,
    "pulse_id": 115892
}
```

You can also request only the upcoming fixtures using future parameter (ex: fixtures?future=1) you will get an array of objects in this format:

```json
{
    "code": 2444821,
    "event": 36,
    "finished": false,
    "finished_provisional": false,
    "id": 352,
    "kickoff_time": "2025-05-10T14:00:00Z",
    "minutes": 0,
    "provisional_start_time": false,
    "started": false,
    "team_a": 8,
    "team_a_score": null,
    "team_h": 9,
    "team_h_score": null,
    "stats": [],
    "team_h_difficulty": 3,
    "team_a_difficulty": 3,
    "pulse_id": 116178
}
```

If you set the future value to 0, you will get all fixtures, but if 1 you will only get the upcoming fixtures. You will get an array of objects:

```json
{
    "code": 2444470,
    "event": 1,
    "finished": true,
    "finished_provisional": true,
    "id": 1,
    "kickoff_time": "2024-08-16T19:00:00Z",
    "minutes": 90,
    "provisional_start_time": false,
    "started": true,
    "team_a": 9,
    "team_a_score": 0,
    "team_h": 14,
    "team_h_score": 1,
    "stats": [
        {
            "identifier": "goals_scored",
            "a": [],
            "h": [
                {
                    "value": 1,
                    "element": 389
                }
            ]
        },
        {
            "identifier": "assists",
            "a": [],
            "h": [
                {
                    "value": 1,
                    "element": 372
                }
            ]
        },
        {
            "identifier": "own_goals",
            "a": [],
            "h": []
        },
        {
            "identifier": "penalties_saved",
            "a": [],
            "h": []
        },
        {
            "identifier": "penalties_missed",
            "a": [],
            "h": []
        },
        {
            "identifier": "yellow_cards",
            "a": [
                {
                    "value": 1,
                    "element": 240
                },
                {
                    "value": 1,
                    "element": 241
                },
                {
                    "value": 1,
                    "element": 243
                }
            ],
            "h": [
                {
                    "value": 1,
                    "element": 377
                },
                {
                    "value": 1,
                    "element": 382
                }
            ]
        },
        {
            "identifier": "red_cards",
            "a": [],
            "h": []
        },
        {
            "identifier": "saves",
            "a": [
                {
                    "value": 4,
                    "element": 248
                }
            ],
            "h": [
                {
                    "value": 2,
                    "element": 383
                }
            ]
        },
        {
            "identifier": "bonus",
            "a": [],
            "h": [
                {
                    "value": 3,
                    "element": 389
                },
                {
                    "value": 2,
                    "element": 594
                },
                {
                    "value": 1,
                    "element": 369
                },
                {
                    "value": 1,
                    "element": 380
                }
            ]
        },
        {
            "identifier": "bps",
            "a": [
                {
                    "value": 16,
                    "element": 249
                },
                {
                    "value": 15,
                    "element": 240
                },
                {
                    "value": 15,
                    "element": 255
                },
                {
                    "value": 13,
                    "element": 245
                },
                {
                    "The rest of the objects..."
                },
            ],
            "h": [
                {
                    "value": 33,
                    "element": 389
                },
                {
                    "value": 32,
                    "element": 594
                },
                {
                    "value": 26,
                    "element": 369
                },
                {
                    "value": 26,
                    "element": 380
                },
                {
                    "The rest of the objects..."
                }

            ]
        },
        {
            "identifier": "mng_underdog_win",
            "a": [],
            "h": []
        },
        {
            "identifier": "mng_underdog_draw",
            "a": [],
            "h": []
        }
    ],
    "team_h_difficulty": 3,
    "team_a_difficulty": 3,
    "pulse_id": 115827
}

```

Here's the explanation of some of the JSON elements:

-   "event" refers to the event id in events section of the bootstrap-static data.
-   "team_a" away team and "team_h" home team refers to the team id in teams section of the bootstrap-static data.
-   "team_h_difficulty" and "team_a_difficulty" is the FDR value calculated by FPL.
-   "stats" contains a list of match facts that affect points of a player. It consists of "goals_scored", "assists", "own_goals", "penalties_saved", "penalties_missed", "yellow_cards", "red_cards", "saves", "bonus", and bps data.
-   "value" is the amount and "element" refers to the element id in elements section of the bootstrap-static data.

### 3. Player's Detailed Data

Endpoint path: element-summary/{element_id}/
Full URL: https://fantasy.premierleague.com/api/element-summary/{element_id}/
Example: https://fantasy.premierleague.com/api/element-summary/4/

This endpoint returns a player's detailed information divided into 3 sections:

```json
{
    "fixtures":[
        ...
    ],
    "history":[
        ...
    ],
    "history_past":[
        ...
    ]
}
```

Fixtures: A list of player's remaining fixtures of the season. Each fixture object consists of these information below:

```json
{
    "fixtures": [
        {
            "id": 354,
            "code": 2444823,
            "team_h": 12,
            "team_h_score": null,
            "team_a": 1,
            "team_a_score": null,
            "event": 36,
            "finished": false,
            "minutes": 0,
            "provisional_start_time": false,
            "kickoff_time": "2025-05-11T15:30:00Z",
            "event_name": "Gameweek 36",
            "is_home": false,
            "difficulty": 5
        }
    ]
}
```

History: A list of player's previous fixtures and its match stats.

```json
{
    "history": [
        {
            "element": 4,
            "fixture": 2,
            "opponent_team": 20,
            "total_points": 12,
            "was_home": true,
            "kickoff_time": "2024-08-17T14:00:00Z",
            "team_h_score": 2,
            "team_a_score": 0,
            "round": 1,
            "modified": false,
            "minutes": 90,
            "goals_scored": 1,
            "assists": 1,
            "clean_sheets": 1,
            "goals_conceded": 0,
            "own_goals": 0,
            "penalties_saved": 0,
            "penalties_missed": 0,
            "yellow_cards": 0,
            "red_cards": 0,
            "saves": 0,
            "bonus": 3,
            "bps": 48,
            "influence": "54.8",
            "creativity": "24.1",
            "threat": "46.0",
            "ict_index": "12.5",
            "starts": 1,
            "expected_goals": "0.45",
            "expected_assists": "0.04",
            "expected_goal_involvements": "0.49",
            "expected_goals_conceded": "0.47",
            "mng_win": 0,
            "mng_draw": 0,
            "mng_loss": 0,
            "mng_underdog_win": 0,
            "mng_underdog_draw": 0,
            "mng_clean_sheets": 0,
            "mng_goals_scored": 0,
            "value": 80,
            "transfers_balance": 0,
            "selected": 1087445,
            "transfers_in": 0,
            "transfers_out": 0
        }
    ]
}
```

History_past: A list of player's previous seasons and its seasonal stats.

```json
{
    "history_past": [
        {
            "season_name": "2020/21",
            "element_code": 219847,
            "start_cost": 85,
            "end_cost": 83,
            "total_points": 91,
            "minutes": 1512,
            "goals_scored": 4,
            "assists": 6,
            "clean_sheets": 8,
            "goals_conceded": 15,
            "own_goals": 0,
            "penalties_saved": 0,
            "penalties_missed": 0,
            "yellow_cards": 2,
            "red_cards": 0,
            "saves": 0,
            "bonus": 3,
            "bps": 268,
            "influence": "325.0",
            "creativity": "307.7",
            "threat": "514.0",
            "ict_index": "114.2",
            "starts": 0,
            "expected_goals": "0.00",
            "expected_assists": "0.00",
            "expected_goal_involvements": "0.00",
            "expected_goals_conceded": "0.00",
            "mng_win": 0,
            "mng_draw": 0,
            "mng_loss": 0,
            "mng_underdog_win": 0,
            "mng_underdog_draw": 0,
            "mng_clean_sheets": 0,
            "mng_goals_scored": 0
        }
    ]
}
```

### 4. Gameweek Live Data

Endpoint path: event/4/live/
Full URL: https://fantasy.premierleague.com/api/event/{event_id}/live/
Example: https://fantasy.premierleague.com/api/event/4/live/

```json
{
    "elements": [
        {
            "id": 1,
            "stats": {
                "minutes": 0,
                "goals_scored": 0,
                "assists": 0,
                "clean_sheets": 0,
                "goals_conceded": 0,
                "own_goals": 0,
                "penalties_saved": 0,
                "penalties_missed": 0,
                "yellow_cards": 0,
                "red_cards": 0,
                "saves": 0,
                "bonus": 0,
                "bps": 0,
                "influence": "0.0",
                "creativity": "0.0",
                "threat": "0.0",
                "ict_index": "0.0",
                "starts": 0,
                "expected_goals": "0.00",
                "expected_assists": "0.00",
                "expected_goal_involvements": "0.00",
                "expected_goals_conceded": "0.00",
                "mng_win": 0,
                "mng_draw": 0,
                "mng_loss": 0,
                "mng_underdog_win": 0,
                "mng_underdog_draw": 0,
                "mng_clean_sheets": 0,
                "mng_goals_scored": 0,
                "total_points": 0,
                "in_dreamteam": false
            },
            "explain": [
                {
                    "fixture": 39,
                    "stats": [
                        {
                            "identifier": "minutes",
                            "points": 0,
                            "value": 0,
                            "points_modification": 0
                        }
                    ]
                }
            ],
            "modified": false
        }
    ]
}
```

-   "id": Refers to the element id in elements section of the bootstrap-static data.
-   "stats": Player's match stats including goals, assists, etc.
-   "explain": Breakdown of a player's event points.

## 5. Set Piece Taker Notes

    Endpoint path: team/set-piece-notes/
    Full URL: https://fantasy.premierleague.com/api/team/set-piece-notes/

A set piece in soccer occurs when a dead ball is put into play after a stoppage. Corners, free kicks, penalty kicks, goal kicks, and throw-ins are all examples of set pieces in soccer. The most effective set pieces often lead to shots on target. This endpoint gives information based on team "id" as to news and updates related to who and when a dead ball was put into play.

Information of each team's set piece taker updates or confirmation. id refers to the team_id.

```json
{
    "last_updated": "2024-12-11T13:21:16Z",
    "teams": [
        {
            "notes": [
                {
                    "external_link": true,
                    "info_message": "Bukayo Saka, Kai Havertz, Martin Odegaard and Fabio Vieira all scored spot-kicks in the first half of 2023/24. Mikel Arteta later said that the players decide themselves on the pitch who takes penalties.",
                    "source_link": ""
                },
                {
                    "external_link": true,
                    "info_message": "Saka took the last four penalties of 2023/24, suggesting he's first in line.",
                    "source_link": ""
                }
            ],
            "id": 1
        },
        {
            "notes": [
                {
                    "external_link": true,
                    "info_message": "Douglas Luiz was on penalties in 2023/24 but has now left the club.",
                    "source_link": ""
                },
                {
                    "external_link": true,
                    "info_message": "Youri Tielemans took and missed Aston Villa's first spot-kick of 2024/25 in Gameweek 12. Ollie Watkins then took and scored one in Gameweek 14.",
                    "source_link": ""
                },
                {
                    "external_link": true,
                    "info_message": "Ollie Watkins had previously taken two penalties in 2022/23, missing one.",
                    "source_link": ""
                }
            ],
            "id": 2
        }
    ]
}
```
