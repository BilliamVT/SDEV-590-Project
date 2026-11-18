package com.housework.api.feature;

/**
 * Which unreleased features are on (decision record 0002). Code asks this, not the properties,
 * so the flags could later come from somewhere else (e.g. the database) without changing callers.
 * Delete a flag, and the code for its off state, once its feature ships.
 */
public interface FeatureFlags {

	/**
	 * Dragging a day to another day in the week view (BILLIAMVT-28). The front end hides the drag
	 * UI while it's off; the move API itself was released with BILLIAMVT-56.
	 */
	boolean dragDrop();

}
