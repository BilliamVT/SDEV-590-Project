package com.housework.api.task;

/**
 * The colors a task can have (BILLIAMVT-65). Stored and sent by name; the front end chooses the
 * shade for light and dark mode. A name the app doesn't know is refused with 400.
 */
public enum TaskColor {
	RED, ORANGE, YELLOW, GREEN, TEAL, BLUE, PURPLE, PINK
}
