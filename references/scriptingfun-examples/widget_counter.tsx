/**
 * Scripting.fun Example: Home Screen Widget with TSX
 * Demonstrates local state, responsive typography, and touch interaction in iOS Scripting App.
 */
import { Text, VStack, HStack, Button, Widget, useWidgetState } from "scripting";

export function CounterWidget() {
  const [count, setCount] = useWidgetState("counter_val", 0);

  return (
    <Widget background="#1C1C1E">
      <VStack alignment="center" spacing={12}>
        <Text font="headline" color="#FFFFFF">Scripting.fun Widget</Text>
        <Text font="system" size={32} color="#0A84FF">{count}</Text>
        <HStack spacing={8}>
          <Button action={() => setCount(count + 1)}>Increment</Button>
          <Button action={() => setCount(0)}>Reset</Button>
        </HStack>
      </VStack>
    </Widget>
  );
}
