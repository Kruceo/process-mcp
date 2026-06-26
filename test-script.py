import time
import sys

# Total runtime target: ~30 seconds
# Print progress every 5 seconds (10%, 20%, ..., 100%)

for i in range(1, 7):
    progress = i * 10
    print(f"Progress: {progress}%...")
    time.sleep(5)

# Print at least one message to stderr
print("Warning: this is a stderr test", file=sys.stderr)

# Final message
print("Done!")
