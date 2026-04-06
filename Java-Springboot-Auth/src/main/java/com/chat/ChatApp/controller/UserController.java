package com.chat.ChatApp.controller;

import com.chat.ChatApp.model.Users;
import com.chat.ChatApp.service.UserService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import com.chat.ChatApp.repo.UserRepo;

@RestController
public class UserController {

    @Autowired
    UserService service;

    @PostMapping("/login")
    public Map<String,String> login(@RequestBody Users user)
    {
        String token = service.verify(user);
        return Collections.singletonMap("token",token);

    }

    @Autowired
    UserRepo userRepo;

    @GetMapping("/users")
    public List<String> getUsers()
    {
        List <Users> users = userRepo.findAll();
        return users.stream()
                .map (Users::getUsername)
            .collect(Collectors.toList());

    }
}
