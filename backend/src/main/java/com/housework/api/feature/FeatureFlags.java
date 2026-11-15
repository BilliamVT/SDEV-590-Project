package com.housework.api.feature;

/**
 * Which unreleased features are on (decision record 0002). Code asks this, not the properties,
 * so the flags could later come from somewhere else (e.g. the database) without changing callers.
 * Delete a flag, and the code for its off state, once its feature ships.
 */
public interface FeatureFlags {

	/** Moving an occurrence to another day (BILLIAMVT-27, 28). */
	boolean dragDrop();

	/** Throws {@link FeatureDisabledException} (404) unless drag-and-drop is on. */
	default void requireDragDrop() {
		if (!dragDrop()) {
			throw new FeatureDisabledException();
		}
	}

}
