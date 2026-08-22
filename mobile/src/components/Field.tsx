import { forwardRef, useState } from 'react';
import { View, Text, TextInput, TextInputProps, StyleProp, ViewStyle, TextStyle } from 'react-native';
import { T, F } from '@/lib/theme';
import { shouldShowFieldPlaceholder } from '@/lib/fieldPlaceholder';

/**
 * TextInput with a placeholder that actually renders in Figtree.
 *
 * iOS draws the native `placeholder` with fallback font metrics whenever the
 * input carries a custom fontFamily — the text comes out in the wrong face
 * with wide letter-spacing (`W h a t   a r e   y o u   s e l l i n g ?`).
 * Passing no `placeholder` to the underlying input and drawing it as an
 * absolutely-positioned <Text> sidesteps that entirely.
 *
 * Use this anywhere a placeholder is visible. Plain TextInput is fine for
 * fields that never show one.
 */
export const Field = forwardRef<TextInput, TextInputProps & {
  placeholder?: string;
  /** Style for the wrapper; the input fills it. */
  containerStyle?: StyleProp<ViewStyle>;
}>(function Field({ placeholder, containerStyle, style, value, multiline, onFocus, onBlur, ...rest }, ref) {
  const [focused, setFocused] = useState(false);
  // Mirror the font/size onto the overlay so it lines up with typed text.
  const flat = Array.isArray(style) ? Object.assign({}, ...style.filter(Boolean)) : (style as TextStyle) ?? {};

  return (
    <View style={[{ justifyContent: multiline ? 'flex-start' : 'center' }, containerStyle]}>
      <TextInput
        ref={ref}
        value={value}
        multiline={multiline}
        style={[style, { textAlignVertical: multiline ? 'top' : 'center' }]}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        {...rest}
      />
      {shouldShowFieldPlaceholder(value, focused) && placeholder ? (
        <Text
          pointerEvents="none"
          numberOfLines={1}
          style={{
            position: 'absolute',
            left: flat.paddingHorizontal ?? flat.padding ?? 0,
            top: multiline ? (flat.paddingTop ?? flat.paddingVertical ?? flat.padding ?? 0) : undefined,
            right: flat.paddingHorizontal ?? flat.padding ?? 0,
            fontFamily: flat.fontFamily ?? F.medium,
            fontSize: flat.fontSize ?? 15,
            lineHeight: flat.lineHeight ?? Math.round((flat.fontSize ?? 15) * 1.3),
            color: T.muted,
          }}
        >
          {placeholder}
        </Text>
      ) : null}
    </View>
  );
});
