"""Tests for the Chrome to Emacs native host."""
import importlib.util
import importlib.machinery
import json
import pathlib
import socket
import tempfile
import unittest
from unittest import mock


HOST_PATH = pathlib.Path(__file__).parents[1] / "open-in-eww-host"
LOADER = importlib.machinery.SourceFileLoader("chrome_to_eww_host", str(HOST_PATH))
SPEC = importlib.util.spec_from_loader(LOADER.name, LOADER)
HOST = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(HOST)


class HostTests(unittest.TestCase):
    """Test request validation and socket lifecycle behavior."""

    def setUp(self):
        HOST._pending.clear()

    def valid_request(self, **changes):
        """Return a valid request with CHANGES applied."""
        request = {
            "action": "fetch",
            "id": "request-1",
            "url": "https://annas-archive.pk/search?q=book",
            "timeout": 45000,
        }
        request.update(changes)
        return request

    def test_request_validation_is_narrow(self):
        """Only bounded Anna's Archive search requests should be accepted."""
        self.assertTrue(HOST.valid_search_request(self.valid_request()))
        self.assertFalse(HOST.valid_search_request(self.valid_request(id="")))
        self.assertFalse(
            HOST.valid_search_request(self.valid_request(url="https://example.com/search"))
        )
        self.assertFalse(
            HOST.valid_search_request(
                self.valid_request(url="https://annas-archive.pk/md5/abc")
            )
        )
        self.assertFalse(HOST.valid_search_request(self.valid_request(timeout=-1)))

    def test_disconnected_client_does_not_raise(self):
        """A canceled client must not crash the native host."""
        client, peer = socket.socketpair()
        peer.close()
        HOST.send_socket_response(client, {"outcome": "transient"})

    def test_native_write_failure_removes_pending_request(self):
        """A failed native write must not leave a stale request ID."""
        client, peer = socket.socketpair()
        request = json.dumps(self.valid_request()).encode() + b"\n"
        peer.sendall(request)
        with mock.patch.object(HOST, "send_native_message", side_effect=BrokenPipeError):
            HOST.handle_socket_client(client)
        response = json.loads(peer.makefile("rb").readline())
        self.assertEqual(response["outcome"], "error")
        self.assertNotIn("request-1", HOST._pending)
        peer.close()

    def test_second_server_does_not_unlink_live_socket(self):
        """A second host must leave the live server socket reachable."""
        with tempfile.TemporaryDirectory() as directory:
            path = str(pathlib.Path(directory) / "bridge.sock")
            with mock.patch.object(HOST, "socket_path", return_value=path):
                server, _ = HOST.create_socket_server()
                try:
                    with self.assertRaisesRegex(RuntimeError, "already running"):
                        HOST.create_socket_server()
                    probe = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
                    probe.connect(path)
                    probe.close()
                finally:
                    server.close()

    def test_invalid_native_response_is_rejected(self):
        """A matching ID is insufficient without a valid response schema."""
        client, peer = socket.socketpair()
        HOST._pending["request-1"] = client
        HOST.handle_native_message({"id": "request-1", "outcome": "empty"})
        response = json.loads(peer.makefile("rb").readline())
        self.assertEqual(response["outcome"], "error")
        self.assertNotIn("request-1", HOST._pending)
        peer.close()


if __name__ == "__main__":
    unittest.main()
